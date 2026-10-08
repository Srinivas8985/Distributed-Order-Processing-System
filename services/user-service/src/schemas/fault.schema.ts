import { z } from 'zod';

export const setFaultSchema = z.object({
  body: z.object({
    id: z.string().min(1),
    type: z.enum(['delay', 'error_500', 'unavailable', 'event_processing_failure', 'outbox_publication_failure']),
    enabled: z.boolean(),
    targetComponent: z.string().min(1),
    delayMs: z.number().int().min(0).max(60000).optional(),
    ttlMs: z.number().int().min(0).max(86400000).optional()
  })
});
