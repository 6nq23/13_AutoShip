// Quick script to create the Autoship database if it doesn't exist
import pg from "pg";

const client = new pg.Client({
  user: "postgres",
  password: "postgres",
  host: "localhost",
  port: 5432,
  database: "postgres", // connect to default db first
});

try {
  await client.connect();
  const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'Autoship'");
  if (res.rowCount === 0) {
    await client.query('CREATE DATABASE "Autoship"');
    console.log('✅ Database "Autoship" created successfully!');
  } else {
    console.log('✅ Database "Autoship" already exists.');
  }
} catch (err) {
  console.error("❌ Error:", err.message);
} finally {
  await client.end();
}
