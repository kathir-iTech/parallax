import { neon } from "@neondatabase/serverless";
import type { Evidence } from "../core/types.ts";
import { ServiceError } from "./schema.ts";

export type Reservation = { key: string; limit: number; seconds: number };
export interface Store {
  reserve(items: Reservation[]): Promise<boolean>;
  get(id: string): Promise<{ evidence: Evidence; session: string } | null>;
  put(evidence: Evidence, session: string): Promise<void>;
  lease(id: string): Promise<boolean>;
  unlock(id: string): Promise<void>;
  remove(id: string, session: string): Promise<void>;
  health(): Promise<boolean>;
}
export function databaseStore(): Store {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new ServiceError(
      "QUOTA_UNAVAILABLE",
      "Live search is paused until the shared quota store is connected.",
      503,
    );
  const sql = neon(url);
  return {
    async reserve(items) {
      const r =
        await sql`SELECT parallax_reserve(${items.map((x) => x.key)}::text[],${items.map((x) => x.limit)}::integer[],${items.map((x) => x.seconds)}::integer[]) AS allowed`;
      return r[0]?.allowed === true;
    },
    async get(id) {
      const r =
        await sql`SELECT payload, session_id FROM parallax_evidence WHERE id=${id} AND expires_at>now()`;
      return r[0]
        ? {
            evidence: r[0].payload as Evidence,
            session: r[0].session_id as string,
          }
        : null;
    },
    async put(evidence, session) {
      await sql`INSERT INTO parallax_evidence(id,session_id,payload,expires_at) VALUES (${evidence.id},${session},${JSON.stringify(evidence)}::jsonb,${evidence.expiresAt}::timestamptz)`;
      // Bounded rows expire after thirty minutes; opportunistic cleanup avoids a paid scheduler.
      await sql`DELETE FROM parallax_evidence WHERE expires_at<now()`;
    },
    async lease(id) {
      const r =
        await sql`INSERT INTO parallax_leases(id,expires_at) VALUES(${id},now()+interval '150 seconds') ON CONFLICT(id) DO UPDATE SET expires_at=EXCLUDED.expires_at WHERE parallax_leases.expires_at<now() RETURNING id`;
      return r.length === 1;
    },
    async unlock(id) {
      await sql`DELETE FROM parallax_leases WHERE id=${id}`;
    },
    async remove(id, session) {
      await sql`DELETE FROM parallax_evidence WHERE id=${id} AND session_id=${session}`;
    },
    async health() {
      const r =
        await sql`SELECT to_regprocedure('parallax_reserve(text[],integer[],integer[])') IS NOT NULL AS ready`;
      return r[0]?.ready === true;
    },
  };
}
