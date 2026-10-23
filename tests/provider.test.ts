import test from "node:test";
import assert from "node:assert/strict";
import { placeFrom, Qloo, resultEntities, safeUrl } from "../server/qloo.ts";
import type { Store } from "../server/store.ts";
import { id } from "./fixture.ts";

test("geographic admission requires actual coordinates and excludes closed places", () => {
  const e = {
    entity_id: id(1),
    name: "Test",
    subtype: "urn:entity:place",
    location: { lat: 40.76, lon: -73.98 },
    properties: {},
  };
  assert.ok(placeFrom(e));
  assert.equal(placeFrom({ ...e, subtype: "urn:entity:movie" }), null);
  assert.equal(placeFrom({ ...e, location: {} }), null);
  assert.equal(placeFrom({ ...e, location: { lat: 51.5, lon: -0.1 } }), null);
  assert.equal(placeFrom({ ...e, properties: { is_closed: true } }), null);
});
test("untrusted metadata URLs cannot execute scripts or embed credentials", () => {
  assert.equal(safeUrl("javascript:alert(1)"), undefined);
  assert.equal(safeUrl("https://user:pass@example.org"), undefined);
  assert.equal(safeUrl("https://example.org/"), "https://example.org/");
});
test("provider response forms are supported; malformed shape is an error", () => {
  const e = { entity_id: id(1), name: "Test" };
  assert.deepEqual(resultEntities({ results: [e] }), [e]);
  assert.deepEqual(resultEntities({ results: { entities: [e] } }), [e]);
  assert.throws(() => resultEntities({ error: "wrong" }));
});
test("quota failure prevents transmission; authentication failure is not retried or exposed", async () => {
  const previous = process.env.QLOO_API_KEY;
  process.env.QLOO_API_KEY = "unit-test-placeholder";
  let calls = 0;
  const transport = (async () => {
    calls++;
    return new Response("secret provider body", { status: 401 });
  }) as typeof fetch;
  const denied = { reserve: async () => false } as unknown as Store;
  try {
    await assert.rejects(
      new Qloo(denied, "session", "ip", transport).request("/search", {
        query: "test",
      }),
      /allowance/,
    );
    assert.equal(calls, 0);
    const allowed = { reserve: async () => true } as unknown as Store;
    await assert.rejects(
      new Qloo(allowed, "session", "ip", transport).request("/search", {
        query: "test",
      }),
      (e) =>
        e instanceof Error &&
        !e.message.includes("secret") &&
        e.message.includes("access"),
    );
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = previous;
  }
});
