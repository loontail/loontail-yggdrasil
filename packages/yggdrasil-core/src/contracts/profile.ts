import { z } from 'zod';

export const GameProfilePropertySchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  signature: z.string().optional(),
});

export const GameProfileSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{32}$/i, 'profile id must be a 32-character undashed hex UUID'),
  name: z.string().min(1),
  properties: z.array(GameProfilePropertySchema).optional(),
});

export const YggdrasilUserSchema = z.object({
  id: z.string().min(1),
  properties: z.array(GameProfilePropertySchema).optional(),
});
