import { z } from 'zod';
import { GameProfileSchema, YggdrasilUserSchema } from './profile.js';

export const YggdrasilSessionSchema = z.object({
  accessToken: z.string().min(1),
  clientToken: z.string().min(1),
  availableProfiles: z.array(GameProfileSchema),
  selectedProfile: GameProfileSchema,
  user: YggdrasilUserSchema.optional(),
});
