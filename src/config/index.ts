import { config } from 'dotenv';
config({ path: `.env.production.local` });

export const CREDENTIALS = process.env.CREDENTIALS === 'true';
export const { NODE_ENV, PORT, SECRET_KEY, LOG_FORMAT, LOG_DIR, ORIGIN, MYDB, PORTDB, USERNAMEDB, PASSWORDDB, IP_LOCAL,Token_DrugAllgy,END_POINT , hospCodeEnv,hospNameEnv,HTTPS,SSL_CRT_FILE,SSL_KEY_FILE,SSL_CHAIN_FILE } = process.env;