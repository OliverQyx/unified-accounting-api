import { ResourceType } from '../types/dto.js';
import type { ProviderRegistryEntry, ProviderName } from '../providers/types.js';
import { getProvider } from '../providers/registry.js';

// The 7 implemented resource types to sync
const SYNC_RESOURCES: ResourceType[] = [
  ResourceType.CompanyInformation,
  ResourceType.AccountingAccounts,
  ResourceType.Customers,
  ResourceType.Suppliers,
  ResourceType.SalesInvoices,
  ResourceType.SupplierInvoices,
  ResourceType.Journals,
];

const PAGE_SIZE = 100;

interface SyncResult {
  provider: string;
  state: string;
  timestamp: string;
  resources: Record<string, {
    data: any[];
    totalCount: number;
    error?: string;
  }>;
  errors: string[];
}

/**
 * Fetch all supported resources for a provider and POST the results to a webhook URL.
 * Runs in the background — does not block the caller.
 */
export function triggerBackgroundSync(params: {
  providerName: ProviderName;
  accessToken: string;
  webhookUrl: string;
  state: string;
  companyId?: string;
}): void {
  // Fire and forget — errors are logged, not thrown
  runSync(params).catch((err) => {
    console.error(`[sync] Fatal error for ${params.providerName}:`, err);
  });
}

async function runSync(params: {
  providerName: ProviderName;
  accessToken: string;
  webhookUrl: string;
  state: string;
  companyId?: string;
}): Promise<void> {
  const { providerName, accessToken, webhookUrl, state, companyId } = params;
  const entry = getProvider(providerName);
  if (!entry) {
    console.error(`[sync] Unknown provider: ${providerName}`);
    return;
  }

  console.log(`[sync] Starting background sync for ${providerName}`);
  const startTime = Date.now();

  const result: SyncResult = {
    provider: providerName,
    state,
    timestamp: new Date().toISOString(),
    resources: {},
    errors: [],
  };

  for (const resourceType of SYNC_RESOURCES) {
    const config = entry.configs[resourceType];
    if (!config) {
      // This provider doesn't support this resource (e.g., Bokio + suppliers)
      continue;
    }

    const resourceKey = resourceType as string;

    try {
      if (config.singleton) {
        // Singleton resource (CompanyInformation)
        const raw = await entry.client.getDetail(accessToken, config.listEndpoint, {
          detailKey: config.detailKey || config.listKey,
          companyId,
          userKey: companyId,
        });
        const mapped = config.mapper(raw);
        result.resources[resourceKey] = {
          data: [mapped],
          totalCount: 1,
        };
      } else {
        // Paginated resource — fetch all pages
        const allData = await fetchAllPages(entry, accessToken, config, companyId);
        result.resources[resourceKey] = {
          data: allData.items,
          totalCount: allData.totalCount,
        };
      }

      const count = result.resources[resourceKey].data.length;
      console.log(`[sync] ${providerName}/${resourceKey}: ${count} items`);
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error(`[sync] ${providerName}/${resourceKey} failed: ${message}`);
      result.resources[resourceKey] = {
        data: [],
        totalCount: 0,
        error: message,
      };
      result.errors.push(`${resourceKey}: ${message}`);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[sync] ${providerName} sync completed in ${duration}ms (${Object.keys(result.resources).length} resources)`);

  // Deliver to webhook
  await deliverWebhook(webhookUrl, result);
}

async function fetchAllPages(
  entry: ProviderRegistryEntry,
  token: string,
  config: { listEndpoint: string; mapper: (raw: any) => any; singleton?: boolean },
  companyId?: string,
): Promise<{ items: any[]; totalCount: number }> {
  const allItems: any[] = [];
  let page = 1;
  let totalCount = 0;

  while (true) {
    const result = await entry.client.getPage(token, config.listEndpoint, {
      page,
      pageSize: PAGE_SIZE,
      companyId,
      userKey: companyId,
    });

    const mapped = result.data.map(config.mapper);
    allItems.push(...mapped);
    totalCount = result.totalCount;

    if (page >= result.totalPages || result.data.length === 0) {
      break;
    }

    page++;
  }

  return { items: allItems, totalCount };
}

async function deliverWebhook(url: string, payload: SyncResult): Promise<void> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`[sync] Webhook delivered to ${url} (${response.status})`);
        return;
      }

      console.error(`[sync] Webhook delivery failed (${response.status}), attempt ${attempt}/${MAX_RETRIES}`);
    } catch (err: any) {
      console.error(`[sync] Webhook delivery error, attempt ${attempt}/${MAX_RETRIES}:`, err?.message);
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  console.error(`[sync] Webhook delivery failed after ${MAX_RETRIES} attempts: ${url}`);
}
