import { z } from 'zod';

/**
 * `POST /api/profiles/minecraft` — body is a flat array of usernames,
 * response is a flat array of `{ id, name }` for each found name.
 * Names not found are omitted from the response (per Mojang spec).
 */
export const BulkProfilesRequestSchema = z.array(z.string().min(1)).max(10);
