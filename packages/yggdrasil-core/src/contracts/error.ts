import { z } from 'zod';

export const YggdrasilErrorBodySchema = z.object({
  error: z.string().min(1),
  errorMessage: z.string().min(1),
  cause: z.string().optional(),
});
