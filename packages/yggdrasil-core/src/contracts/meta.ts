import { z } from 'zod';

export const YggdrasilMetaFeaturesSchema = z
  .object({
    non_email_login: z.boolean().optional(),
    username_check: z.boolean().optional(),
    legacy_skin_api: z.boolean().optional(),
    no_mojang_namespace: z.boolean().optional(),
    enable_mojang_anti_features: z.boolean().optional(),
    enable_profile_key: z.boolean().optional(),
  })
  .partial();

export const YggdrasilMetaInfoSchema = z.object({
  serverName: z.string().min(1),
  implementationName: z.string().min(1),
  implementationVersion: z.string().min(1),
  links: z
    .object({
      homepage: z.string().url().optional(),
      register: z.string().url().optional(),
    })
    .optional(),
  feature: YggdrasilMetaFeaturesSchema.optional(),
});

export const YggdrasilMetaSchema = z.object({
  meta: YggdrasilMetaInfoSchema,
  skinDomains: z.array(z.string().min(1)),
  signaturePublickey: z.string().min(1),
  signaturePublickeys: z.array(z.string().min(1)).optional(),
});
