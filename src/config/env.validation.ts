import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string().required(),

  REDIS_URL: Joi.string().required(),

  JWT_ACCESS_PRIVATE_KEY_PATH: Joi.string().required(),
  JWT_ACCESS_PUBLIC_KEY_PATH: Joi.string().required(),
  JWT_ACCESS_ISSUER: Joi.string().required(),
  JWT_ACCESS_AUDIENCE: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),

  JWT_REFRESH_SECRET: Joi.string().required(),

  JWT_SESSION_IDLE_TIMEOUT: Joi.string().required(),
  JWT_SESSION_ABSOLUTE_LIFETIME: Joi.string().required(),
});
