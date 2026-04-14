import pkg from "pg";

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "rutasdb",
  user: process.env.DB_USER || "rutasuser",
  password: process.env.DB_PASSWORD || "rutaspass",
});

export default pool;
