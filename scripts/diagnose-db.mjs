import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false }
});
try {
  const r = await pool.query(`
    SELECT current_database() AS database,
      current_user AS "user",
      version() AS version,
      inet_server_addr() AS server_addr
  `);
  console.log("INITIAL VERIFICATION QUERY PASSED");
  console.log(r.rows[0]);
} catch (e) {
  console.log("QUERY FAILED:", e.message);
  console.log("CODE:", e.code);
} finally {
  await pool.end();
}
