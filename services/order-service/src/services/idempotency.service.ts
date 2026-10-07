import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { ApplicationError } from '../utils/errors';
import { logger } from '../lib/logger';

export class IdempotencyService {
  async runIdempotentAction(
    key: string,
    requestHash: string,
    action: () => Promise<{ code: number; body: any }>
  ): Promise<{ code: number; body: any }> {
    try {
      // Try to acquire the idempotency lock by inserting the key
      await prisma.idempotencyKey.create({
        data: {
          key,
          requestHash
        }
      });
      
      logger.info({ event: 'idempotency_key_created', key, requestHash });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Unique constraint violation - key already exists
        return this.handleConflict(key, requestHash);
      }
      throw error;
    }

    // Key acquired successfully. Run the actual action.
    let result: { code: number; body: any };
    try {
      result = await action();
    } catch (error: any) {
      // Phase 0: We cache 503s or other errors too so that retries return the exact same error
      if (error.status && error.code) {
        await this.updateKeyWithResponse(key, error.status, {
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable ?? false
          }
        });
      } else {
        // If it's a completely unhandled crash or DB issue, we can delete the key 
        // to let the user retry safely, or leave it. Phase 0 says "If transaction fails, it rolls back".
        // Since we are not in the same Prisma transaction, we must manually delete it.
        await prisma.idempotencyKey.delete({ where: { key } }).catch(() => {});
      }
      throw error;
    }

    // Action succeeded (201 etc). Update the key with the result.
    await this.updateKeyWithResponse(key, result.code, result.body);
    return result;
  }

  private async handleConflict(key: string, requestHash: string): Promise<{ code: number; body: any }> {
    // Wait briefly (100ms) as per Phase 0 design to allow in-flight to finish
    await new Promise(res => setTimeout(res, 100));

    const existingKey = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (!existingKey) {
      // Extremely rare edge case: it was deleted in the 100ms window
      throw new ApplicationError('IDEMPOTENCY_ERROR', 'Idempotency state is invalid', 500);
    }

    if (existingKey.requestHash !== requestHash) {
      logger.warn({ event: 'idempotency_conflict', key, reason: 'hash_mismatch' });
      throw new ApplicationError(
        'IDEMPOTENCY_CONFLICT',
        'This Idempotency-Key was already used with a different request body',
        409
      );
    }

    if (existingKey.responseCode === null || existingKey.responseBody === null) {
      logger.warn({ event: 'idempotency_concurrent_conflict', key, reason: 'in_flight' });
      throw new ApplicationError('IDEMPOTENCY_CONFLICT', 'Request in progress', 409);
    }

    logger.info({ event: 'idempotency_replay', key });
    
    // If original returned an error (e.g., 503), throw it again to emulate exact behavior
    if (existingKey.responseCode >= 400) {
      const errBody = existingKey.responseBody as any;
      const code = errBody?.error?.code || 'INTERNAL_ERROR';
      const message = errBody?.error?.message || 'Cached error';
      throw new ApplicationError(code, message, existingKey.responseCode);
    }

    // Return the cached successful response
    return {
      code: 200, // Phase 0 says return 200 OK (not 201) to signal this is a replay
      body: existingKey.responseBody
    };
  }

  private async updateKeyWithResponse(key: string, code: number, body: any) {
    await prisma.idempotencyKey.update({
      where: { key },
      data: {
        responseCode: code,
        responseBody: body
      }
    });
  }
}
