import { readFileSync, existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is not configured. No value was printed.");
const sql = neon(process.env.DATABASE_URL);
const migration = readFileSync("server/migration.sql", "utf8");
const boundary = migration.indexOf("CREATE OR REPLACE FUNCTION");
for (const statement of migration
  .slice(0, boundary)
  .split(";")
  .map((x) => x.trim())
  .filter(Boolean))
  await sql.query(statement);
await sql.query(migration.slice(boundary));
const result =
  await sql`SELECT to_regprocedure('parallax_reserve(text[],integer[],integer[])') IS NOT NULL AS ready`;
console.log(
  JSON.stringify({ migration: "parallax/1", ready: result[0]?.ready === true }),
);
