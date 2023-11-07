import postgres from 'postgres';
import { POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT, POSTGRES_DB } from '@config';

const sql = postgres({
  host: POSTGRES_HOST, // Use the environment variable
  port: parseInt(POSTGRES_PORT, 10), // Convert to a number
  database: POSTGRES_DB, // Use the environment variable
  username: POSTGRES_USER, // Use the environment variable
  password: POSTGRES_PASSWORD, // Use the environment variable
});

export default sql;
