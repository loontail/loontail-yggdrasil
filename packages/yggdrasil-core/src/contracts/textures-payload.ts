import { z } from 'zod';

const TextureSkinEntrySchema = z.object({
  url: z.string().min(1),
  metadata: z
    .object({
      model: z.literal('slim'),
    })
    .optional(),
});

const TextureCapeEntrySchema = z.object({
  url: z.string().min(1),
});

export const TexturesPayloadSchema = z.object({
  timestamp: z.number().finite(),
  profileId: z
    .string()
    .regex(/^[0-9a-f]{32}$/i, 'profileId must be a 32-character undashed hex UUID'),
  profileName: z.string().min(1),
  textures: z.object({
    SKIN: TextureSkinEntrySchema.optional(),
    CAPE: TextureCapeEntrySchema.optional(),
  }),
});
