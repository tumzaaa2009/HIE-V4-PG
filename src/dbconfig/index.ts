const { Pool } = require('pg');
import { POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT, POSTGRES_DB } from '@config';

const sql = new Pool({
  user: POSTGRES_USER,
  host:POSTGRES_HOST ,
  database: POSTGRES_DB,
  password: POSTGRES_PASSWORD,
  port: POSTGRES_PORT,
});

export default sql;
