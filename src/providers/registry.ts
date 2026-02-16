import type { ProviderName, ProviderRegistryEntry } from './types.js';

import { fortnoxClient } from './fortnox/client.js';
import { fortnoxResourceConfigs } from './fortnox/config.js';
import { fortnoxOAuth } from './fortnox/oauth.js';

import { vismaClient } from './visma/client.js';
import { vismaResourceConfigs } from './visma/config.js';
import { vismaOAuth } from './visma/oauth.js';

import { brioxClient } from './briox/client.js';
import { brioxConfigs } from './briox/config.js';
import { brioxOAuth } from './briox/oauth.js';

import { bokioClient } from './bokio/client.js';
import { bokioConfigs } from './bokio/config.js';
import { bokioOAuth } from './bokio/oauth.js';

import { bjornLundenClient } from './bjornlunden/client.js';
import { bjornLundenConfigs } from './bjornlunden/config.js';
import { bjornLundenOAuth } from './bjornlunden/oauth.js';

const registry: Record<ProviderName, ProviderRegistryEntry> = {
  fortnox: {
    client: fortnoxClient,
    configs: fortnoxResourceConfigs,
    oauth: fortnoxOAuth,
  },
  visma: {
    client: vismaClient,
    configs: vismaResourceConfigs,
    oauth: vismaOAuth,
  },
  briox: {
    client: brioxClient,
    configs: brioxConfigs,
    oauth: brioxOAuth,
  },
  bokio: {
    client: bokioClient,
    configs: bokioConfigs,
    oauth: bokioOAuth,
    requiresCompanyId: true,
  },
  bjornlunden: {
    client: bjornLundenClient,
    configs: bjornLundenConfigs,
    oauth: bjornLundenOAuth,
    requiresCompanyId: true,
  },
};

export function getProvider(name: string): ProviderRegistryEntry | undefined {
  return registry[name as ProviderName];
}

export function isValidProvider(name: string): name is ProviderName {
  return name in registry;
}

export const VALID_PROVIDERS = Object.keys(registry) as ProviderName[];
