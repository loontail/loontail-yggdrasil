import { z } from 'zod';

export const BulkProfilesRequestSchema = z.array(z.string().min(1)).max(10);
