import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { databaseStore } from "../server/store.ts";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const sql = neon(process.env.DATABASE_URL!),
  store = databaseStore(),
  prefix = `verification:${randomUUID()}`;
try {
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      store.reserve([{ key: prefix, limit: 3, seconds: 60 }]),
    ),
  );
  assert.equal(results.filter(Boolean).length, 3);
  const denied = await store.reserve([
    { key: prefix, limit: 3, seconds: 60 },
    { key: prefix + ":other", limit: 20, seconds: 60 },
  ]);
  assert.equal(denied, false);
  const r =
    await sql`SELECT used FROM parallax_quota WHERE id=${prefix + ":other"}`;
  assert.equal(r.length, 0);
  console.log(
    JSON.stringify({
      class: "real shared Postgres concurrency check",
      concurrentReservations: 12,
      admitted: 3,
      limit: 3,
      deniedReservationDidNotPartiallyConsume: true,
      passed: true,
    }),
  );
} finally {
  await sql`DELETE FROM parallax_quota WHERE id LIKE ${prefix + "%"}`;
}
