import { z } from 'zod';

export const createOrderSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    items: z.array(
      z.object({
        productName: z.string().min(1).max(255).trim(),
        quantity: z.number().int().min(1),
        unitPrice: z.number().min(0).refine((val) => {
          return /^\d+(\.\d{1,2})?$/.test(val.toString());
        }, 'Max 2 decimal places allowed')
      })
    ).min(1).max(50)
  })
});

export const orderIdSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
});
