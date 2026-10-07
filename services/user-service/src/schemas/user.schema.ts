import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email().max(255),
    name: z.string().min(1).max(255).trim()
  })
});

export const userIdSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
});
