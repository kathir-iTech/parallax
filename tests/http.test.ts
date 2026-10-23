import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Evidence } from "../core/types.ts";
import { createHandler } from "../server/handler.ts";
import type { Store } from "../server/store.ts";
import { fixture, id } from "./fixture.ts";
import { proveReference } from "../server/auth.ts";

test("actual HTTP round trip enforces session scope, input bounds, removal and errors", async () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET =
    "test-only-secret-with-more-than-thirty-two-characters";
  const records = new Map<string, { evidence: Evidence; session: string }>();
  let allowed = true;
  const store: Store = {
    reserve: async () => allowed,
    get: async (id) => records.get(id) ?? null,
    put: async (e, s) => {
      records.set(e.id, { evidence: e, session: s });
    },
    lease: async () => true,
    unlock: async () => {},
    remove: async (id, s) => {
      if (records.get(id)?.session === s) records.delete(id);
    },
    health: async () => true,
  };
  const server = createServer(createHandler(store));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown, token?: string) =>
    fetch(origin + "/api/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const status = await fetch(origin + "/api/status");
    assert.equal(status.status, 200);
    const session = (await (await post("session", {})).json()) as {
      token: string;
    };
    const { sessionId } = await import("../server/auth.ts");
    const sid = sessionId(session.token),
      e = fixture();
    e.expiresAt = new Date(Date.now() + 1800000).toISOString();
    records.set(e.id, { evidence: e, session: sid });
    const ok = await post(
      "advise",
      { evidenceId: e.id, answers: [] },
      session.token,
    );
    assert.equal(ok.status, 200);
    const other = (await (await post("session", {})).json()) as {
      token: string;
    };
    assert.equal(
      (await post("advise", { evidenceId: e.id, answers: [] }, other.token))
        .status,
      410,
    );
    assert.equal(
      (
        await post(
          "advise",
          {
            evidenceId: e.id,
            answers: [
              { id: id(300), a: id(999), b: e.places[0].id, choice: "a" },
            ],
          },
          session.token,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await post(
          "advise",
          { evidenceId: e.id, answers: Array.from({ length: 9 }, () => ({})) },
          session.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (await post("forget", { evidenceId: e.id }, session.token)).status,
      200,
    );
    assert.equal(records.has(e.id), false);
    assert.equal(
      (await post("advise", { evidenceId: e.id, answers: [] }, session.token))
        .status,
      410,
    );
    allowed = false;
    assert.equal((await post("session", {})).status, 429);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
test("signed reference proof prevents fabricated name and type provenance", async () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET =
    "another-test-only-secret-longer-than-thirty-two-characters";
  try {
    const { verifyReference } = await import("../server/auth.ts");
    const r = fixture().references[0],
      proved = proveReference(r);
    assert.deepEqual(
      verifyReference({ ...proved, name: "Forged browser label" }),
      r,
    );
    assert.throws(() => verifyReference({ ...proved, kind: "movie" }));
    assert.throws(() => verifyReference(r));
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
