import { z } from 'zod';

const UndashedUuid = z
  .string()
  .regex(/^[0-9a-f]{32}$/i, 'selectedProfile must be a 32-character undashed hex UUID');

export const JoinRequestSchema = z.object({
  accessToken: z.string().min(1),
  selectedProfile: UndashedUuid,
  serverId: z.string().min(1),
});

export const HasJoinedQuerySchema = z.object({
  username: z.string().min(1),
  serverId: z.string().min(1),
  ip: z.string().optional(),
});

export const ProfileLookupParamSchema = z.object({
  uuid: UndashedUuid,
});

export const ProfileLookupQuerySchema = z.object({
  unsigned: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => !(v === false || v === 'false')),
});
