import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { ResourceType } from '../types/dto.js';
import { getProvider, isValidProvider } from '../providers/registry.js';
import { authMiddleware, providerTokenMiddleware } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { getCurrentFinancialYear } from '../providers/briox/client.js';

const router = Router();

const RESOURCE_TYPE_MAP: Record<string, ResourceType> = Object.fromEntries(
  Object.values(ResourceType).map((v) => [v, v as ResourceType])
);

// All resource routes require API key + provider token
router.use(authMiddleware);
router.use(providerTokenMiddleware);

// GET /:provider/:resourceType — list resources
router.get('/:provider/:resourceType', async (req: Request, res: Response, next: NextFunction) => {
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

    // Parse query params
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 100;
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

    // Journal entry hydration (Fortnox, Briox)
    if (config.needsEntryHydration && includeEntries && data.length > 0) {
      const BATCH_SIZE = 5;
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
