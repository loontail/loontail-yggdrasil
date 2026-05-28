import { z } from 'zod';

export const TexturesLookupResponseSchema = z.object({
  skin: z
    .object({
      url: z.string().min(1),
      variant: z.enum(['CLASSIC', 'SLIM']),
    })
    .nullable(),
  cape: z
    .object({
      url: z.string().min(1),
    })
    .nullable(),
});

export type TexturesLookupResponse = z.infer<typeof TexturesLookupResponseSchema>;
