import { z } from 'zod';
import { GameProfileSchema } from './profile.js';

const AgentSchema = z.object({
  name: z.literal('Minecraft'),
  version: z.literal(1),
});

export const AuthenticateRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  clientToken: z.string().min(1).optional(),
  requestUser: z.boolean().optional(),
  agent: AgentSchema.optional(),
});

export const RefreshRequestSchema = z.object({
  accessToken: z.string().min(1),
  clientToken: z.string().min(1).optional(),
  requestUser: z.boolean().optional(),
  selectedProfile: GameProfileSchema.optional(),
});

export const ValidateRequestSchema = z.object({
  accessToken: z.string().min(1),
  clientToken: z.string().min(1).optional(),
});

export const InvalidateRequestSchema = ValidateRequestSchema;
