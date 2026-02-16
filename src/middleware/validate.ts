import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

type RequestLocation = 'body' | 'query' | 'params';

export function validate(schema: z.ZodType, location: RequestLocation = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[location]);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten().fieldErrors,
        statusCode: 400,
      });
      return;
    }

    // Replace with parsed/coerced values
    (req as any)[location] = result.data;
    next();
  };
}
