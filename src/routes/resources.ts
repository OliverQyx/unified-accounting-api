import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ResourceType } from '../types/dto.js';
import { getProvider, isValidProvider } from '../providers/registry.js';
import { authMiddleware, providerTokenMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { getCurrentFinancialYear } from '../providers/briox/client.js';
import { getFortnoxAttachments, downloadFortnoxFile } from '../providers/fortnox/client.js';

const router = Router();

const RESOURCE_TYPE_MAP: Record<string, ResourceType> = Object.fromEntries(
  Object.values(ResourceType).map((v) => [v, v as ResourceType])
);

// All resource routes require API key + provider token
router.use(authMiddleware);
router.use(providerTokenMiddleware);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  includeEntries: z.string().optional(),
  includeBalances: z.string().optional(),
  lastModified: z.string().optional(),
  modifiedSince: z.string().optional(),
  financialYear: z.string().optional(),
  query: z.string().optional(),
}).passthrough();

// GET /:provider/:resourceType — list resources
router.get('/:provider/:resourceType', validate(listQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerName = req.params.provider as string;
    const resourceTypeSlug = req.params.resourceType as string;

    if (!isValidProvider(providerName)) {
      throw new AppError(`Unknown provider: ${providerName}`, 400, 'INVALID_PROVIDER');
    }

    const resourceType = RESOURCE_TYPE_MAP[resourceTypeSlug];
    if (!resourceType) {
      throw new AppError(`Unknown resource type: ${resourceTypeSlug}`, 400, 'UNSUPPORTED_RESOURCE');
    }

    const entry = getProvider(providerName)!;
    const config = entry.configs[resourceType];
    if (!config) {
      throw new AppError(
        `Resource type '${resourceTypeSlug}' is not supported by provider '${providerName}'`,
        400,
        'UNSUPPORTED_RESOURCE',
        providerName
      );
    }

    const providerToken = req.headers['x-provider-token'] as string;
    const companyId = req.headers['x-company-id'] as string | undefined;

    if (entry.requiresCompanyId && !companyId) {
      throw new AppError(
        `X-Company-Id header is required for provider '${providerName}'`,
        400,
        'MISSING_COMPANY_ID',
        providerName
      );
    }

    // Query params (validated and coerced by Zod middleware)
    const page = req.query.page as unknown as number;
    const pageSize = req.query.pageSize as unknown as number;
    const includeEntries = req.query.includeEntries !== 'false';
    const includeBalances = req.query.includeBalances === 'true';

    // Build provider-specific query params
    const query: Record<string, string> = {};
    if (req.query.lastModified) query.lastModified = req.query.lastModified as string;
    if (req.query.modifiedSince) query.modifiedSince = req.query.modifiedSince as string;
    if (req.query.financialYear) query.financialYear = req.query.financialYear as string;
    if (req.query.query) query.query = req.query.query as string;
    if (!includeEntries) query.includeEntries = 'false';
    if (includeBalances) query.includeBalances = 'true';

    // Singleton resources (CompanyInformation)
    if (config.singleton) {
      const raw = await entry.client.getDetail(providerToken, config.listEndpoint, {
        detailKey: config.detailKey || config.listKey,
        companyId,
        userKey: companyId,
      });
      const mapped = config.mapper(raw);
      res.json({ data: mapped });
      return;
    }

    // Year-scoped resources (e.g. Briox journals) need financial year in path
    let listEndpoint = config.listEndpoint;
    if (config.yearScoped) {
      const year = (req.query.financialYear as string) ||
        await getCurrentFinancialYear(providerToken);
      listEndpoint = `${listEndpoint}/${year}`;
    }

    // Paginated list
    const result = await entry.client.getPage(providerToken, listEndpoint, {
      page,
      pageSize,
      query,
      companyId,
      userKey: companyId,
    });

    // Map raw items to canonical DTOs
    const data = result.data.map(config.mapper);

    // Journal entry hydration (Fortnox, Briox, Björn Lundén)
    if (config.needsEntryHydration && includeEntries && data.length > 0) {
      const BATCH_SIZE = 10;
      const hydrationStart = Date.now();
      for (let i = 0; i < result.data.length; i += BATCH_SIZE) {
        const batch = result.data.slice(i, i + BATCH_SIZE);
        const details = await Promise.all(
          batch.map(async (item: any, batchIdx: number) => {
            try {
              const id = item[config.idField];
              let detailPath = config.detailEndpoint.replace('{id}', String(id));

              // Fortnox vouchers: {series}/{number}?financialyear={year}
              if (providerName === 'fortnox' && resourceType === ResourceType.Journals) {
                const series = item.VoucherSeries || item.Series;
                const number = item.VoucherNumber || item.Number;
                const year = req.query.financialYear || item.Year;
                detailPath = `/vouchers/${series}/${number}${year ? `?financialyear=${year}` : ''}`;
              }

              // Briox journals: /journal/{year}/{series}/{id}
              if (providerName === 'briox' && resourceType === ResourceType.Journals) {
                const year = req.query.financialYear || item.financial_year_id || item.year;
                const series = item.series || '';
                detailPath = `/journal/${year}/${series}/${id}`;
              }

              // Björn Lundén journals: /journal/entry/{entityId}
              if (providerName === 'bjornlunden' && resourceType === ResourceType.Journals) {
                const entityId = item.entityId || id;
                detailPath = `/journal/entry/${entityId}`;
              }

              const detail = await entry.client.getDetail(providerToken, detailPath, {
                detailKey: config.detailKey,
                companyId,
                userKey: companyId,
              });

              const detailMapper = config.detailMapper || config.mapper;
              return detailMapper(detail);
            } catch {
              // Return the non-hydrated version on failure
              return data[i + batchIdx];
            }
          })
        );

        for (let j = 0; j < details.length; j++) {
          data[i + j] = details[j];
        }
      }
      const hydrationMs = Date.now() - hydrationStart;
      if (hydrationMs > 5000) {
        console.warn(`Slow hydration: ${providerName}/${resourceTypeSlug} took ${hydrationMs}ms for ${result.data.length} items`);
      }
    }

    res.json({
      data,
      page: result.currentPage,
      pageSize,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      hasMore: result.currentPage < result.totalPages,
    });
  } catch (err) {
    next(err);
  }
});

// GET /:provider/:resourceType/:id/pdf — download PDF attachment(s) for a resource
router.get('/:provider/:resourceType/:id/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerName = req.params.provider as string;
    const resourceTypeSlug = req.params.resourceType as string;
    const id = req.params.id as string;

    if (providerName !== 'fortnox') {
      throw new AppError(`PDF attachment fetching is not supported for provider '${providerName}'`, 400, 'UNSUPPORTED_OPERATION');
    }

    if (resourceTypeSlug !== 'salesinvoices') {
      throw new AppError(`PDF attachment fetching is not supported for resource type '${resourceTypeSlug}'`, 400, 'UNSUPPORTED_OPERATION');
    }

    const providerToken = req.headers['x-provider-token'] as string;

    const attachments = await getFortnoxAttachments(providerToken, id, 'F');

    if (!attachments || attachments.length === 0) {
      res.json({ data: [] });
      return;
    }

    const files = await Promise.all(
      attachments.map(async (attachment) => {
        const { buffer, contentType, filename } = await downloadFortnoxFile(providerToken, attachment.fileId);
        return {
          fileId: attachment.fileId,
          filename,
          contentType,
          base64: Buffer.from(buffer).toString('base64'),
        };
      })
    );

    res.json({ data: files });
  } catch (err) {
    next(err);
  }
});

// GET /:provider/:resourceType/:id — get single resource
router.get('/:provider/:resourceType/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerName = req.params.provider as string;
    const resourceTypeSlug = req.params.resourceType as string;
    const id = req.params.id as string;

    if (!isValidProvider(providerName)) {
      throw new AppError(`Unknown provider: ${providerName}`, 400, 'INVALID_PROVIDER');
    }

    const resourceType = RESOURCE_TYPE_MAP[resourceTypeSlug];
    if (!resourceType) {
      throw new AppError(`Unknown resource type: ${resourceTypeSlug}`, 400, 'UNSUPPORTED_RESOURCE');
    }

    const entry = getProvider(providerName)!;
    const config = entry.configs[resourceType];
    if (!config) {
      throw new AppError(
        `Resource type '${resourceTypeSlug}' is not supported by provider '${providerName}'`,
        400,
        'UNSUPPORTED_RESOURCE',
        providerName
      );
    }

    const providerToken = req.headers['x-provider-token'] as string;
    const companyId = req.headers['x-company-id'] as string | undefined;

    if (entry.requiresCompanyId && !companyId) {
      throw new AppError(
        `X-Company-Id header is required for provider '${providerName}'`,
        400,
        'MISSING_COMPANY_ID',
        providerName
      );
    }

    let detailPath = config.detailEndpoint.replace('{id}', id);

    // Fortnox vouchers: composite ID format {series}-{number}
    if (providerName === 'fortnox' && resourceType === ResourceType.Journals) {
      const parts = id.split('-');
      if (parts.length >= 2) {
        const series = parts[0];
        const number = parts.slice(1).join('-');
        const year = req.query.financialYear as string;
        detailPath = `/vouchers/${series}/${number}${year ? `?financialyear=${year}` : ''}`;
      }
    }

    const raw = await entry.client.getDetail(providerToken, detailPath, {
      detailKey: config.detailKey,
      companyId,
      userKey: companyId,
    });

    const mapper = config.detailMapper || config.mapper;
    const data = mapper(raw);

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
