import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const baseSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEYS: z.string().min(1, 'At least one API key is required'),
});

const parsed = baseSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  apiKeys: parsed.data.API_KEYS.split(',').map((k) => k.trim()).filter(Boolean),
};

// Provider env schemas — validated lazily on first use
const fortnoxSchema = z.object({
  FORTNOX_CLIENT_ID: z.string().min(1),
  FORTNOX_CLIENT_SECRET: z.string().min(1),
  FORTNOX_REDIRECT_URI: z.string().url(),
});

const vismaSchema = z.object({
  VISMA_CLIENT_ID: z.string().min(1),
  VISMA_CLIENT_SECRET: z.string().min(1),
  VISMA_REDIRECT_URI: z.string().url(),
});

const brioxSchema = z.object({
  BRIOX_CLIENT_ID: z.string().min(1),
});

const bjornLundenSchema = z.object({
  BJORN_LUNDEN_CLIENT_ID: z.string().min(1),
  BJORN_LUNDEN_CLIENT_SECRET: z.string().min(1),
});

const providerEnvCache: Record<string, unknown> = {};

function getProviderEnv<T>(name: string, schema: z.ZodType<T>): T {
  if (providerEnvCache[name]) return providerEnvCache[name] as T;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Missing environment variables for ${name}: ${Object.keys(result.error.flatten().fieldErrors).join(', ')}`
    );
  }
  providerEnvCache[name] = result.data;
  return result.data;
}

export const getFortnoxEnv = () => getProviderEnv('Fortnox', fortnoxSchema);
export const getVismaEnv = () => getProviderEnv('Visma', vismaSchema);
export const getBrioxEnv = () => getProviderEnv('Briox', brioxSchema);
export const getBjornLundenEnv = () => getProviderEnv('BjornLunden', bjornLundenSchema);
