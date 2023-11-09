import { config } from 'dotenv';
config({ path: `.env.production.local` });

export const CREDENTIALS = process.env.CREDENTIALS === 'true';
export const { NODE_ENV, PORT, SECRET_KEY, LOG_FORMAT, LOG_DIR, ORIGIN, POSTGRES_DB, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST,Token_DrugAllgy,END_POINT , hospCodeEnv,hospNameEnv,HTTPS,SSL_CRT_FILE,SSL_KEY_FILE,SSL_CHAIN_FILE } = process.env;