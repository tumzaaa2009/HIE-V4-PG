import { config } from 'dotenv';
config({ path: `.env.production.local` });

export const CREDENTIALS = process.env.CREDENTIALS === 'true';
export const {
  POSTGRES_HOST,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_DB,
  NODE_ENV,
  PORT,
  SECRET_KEY,
  LOG_FORMAT,
  LOG_DIR,
  ORIGIN,
  Token_DrugAllgy,
  END_POINT,
  hospCodeEnv,hospNameEnv
} = process.env;
