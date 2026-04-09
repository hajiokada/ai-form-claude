import { z } from 'zod';
import appsRaw from '../../config/apps.json';
import modelsRaw from '../../config/models.json';

export const ProviderSchema = z.enum(['anthropic', 'openai', 'google']);
export type Provider = z.infer<typeof ProviderSchema>;

export const ModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: ProviderSchema,
  apiModel: z.string(),
});
export type ModelDef = z.infer<typeof ModelSchema>;

export const AppSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string().default(''),
  password: z.string().nullable().optional(),
  systemPrompt: z.string(),
  defaultModel: z.string().optional(),
  allowedModels: z.array(z.string()).optional(),
});
export type AppDef = z.infer<typeof AppSchema>;

export const ALL_MODELS: ModelDef[] = z.array(ModelSchema).parse(modelsRaw);
export const ALL_APPS: AppDef[] = z.array(AppSchema).parse(appsRaw);

const ENV_KEY: Record<Provider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

export function providerAvailable(p: Provider): boolean {
  return Boolean(process.env[ENV_KEY[p]]);
}

/** Server-side: model ids whose provider has an API key set. */
export function availableModelIds(): string[] {
  return ALL_MODELS.filter((m) => providerAvailable(m.provider)).map((m) => m.id);
}

/** Resolve effective allowed models for an app, intersecting with env availability. */
export function effectiveAllowedModels(app: AppDef, available: string[]): ModelDef[] {
  const allowed = app.allowedModels && app.allowedModels.length > 0 ? app.allowedModels : available;
  const set = new Set(available);
  return ALL_MODELS.filter((m) => allowed.includes(m.id) && set.has(m.id));
}

export function getApp(slug: string): AppDef | undefined {
  return ALL_APPS.find((a) => a.slug === slug);
}

export function getModel(id: string): ModelDef | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

export function assertStartupEnv() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required.');
  }
}
