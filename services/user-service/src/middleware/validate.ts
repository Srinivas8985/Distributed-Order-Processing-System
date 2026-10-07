import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Update the request with the validated (and potentially transformed/stripped) data
      req.body = validated.body;
      req.query = validated.query;
      req.params = validated.params;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // We pass the ZodError directly to our centralized error handler
        next(error);
      } else {
        next(error);
      }
    }
  };
};
