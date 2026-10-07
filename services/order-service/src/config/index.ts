import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  RABBITMQ_URL: z.string(),
  USER_SERVICE_URL: z.string(),
  USER_SERVICE_TIMEOUT_MS: z.coerce.number().min(0).default(3000),
  USER_SERVICE_MAX_ATTEMPTS: z.coerce.number().min(1).default(4), // 1 initial + 3 retries
  USER_SERVICE_RETRY_BASE_DELAY_MS: z.coerce.number().min(0).default(1000),
  USER_SERVICE_RETRY_MAX_DELAY_MS: z.coerce.number().min(0).default(5000),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().min(1).default(5),
  CIRCUIT_BREAKER_OPEN_DURATION_MS: z.coerce.number().min(0).default(30000),
  CIRCUIT_BREAKER_HALF_OPEN_MAX_REQUESTS: z.coerce.number().min(1).default(1),
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD: z.coerce.number().min(1).default(2),
  INTERNAL_SERVICE_TOKEN: z.string(),
  ADMIN_API_KEY: z.string(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const config = _env.data;
