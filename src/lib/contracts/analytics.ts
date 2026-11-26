import { z } from 'zod';
import { FunnelEventTypeSchema } from './enums';

export const RecordFunnelEventSchema = z.object({
  sessionId: z
    .string()
    .trim()
    .min(6)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/),
  eventType: FunnelEventTypeSchema,
  serviceSlug: z.string().trim().max(120).nullable().optional(),
  staffSlug: z.string().trim().max(120).nullable().optional(),
});
