import type { Evidence, Place, Reference } from "../core/types.ts";
import type { Store } from "./store.ts";
import { ServiceError } from "./schema.ts";
import { randomUUID } from "node:crypto";

type Obj = Record<string, unknown>;
const object = (x: unknown): Obj =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {};
const text = (x: unknown, max = 1600) =>
  typeof x === "string" ? x.slice(0, max) : undefined;
const number = (x: unknown) =>
  typeof x === "number" && Number.isFinite(x) ? x : undefined;
export const safeUrl = (x: unknown): string | undefined => {
  if (typeof x !== "string" || x.length > 1500) return;
  try {
    const u = new URL(x);
    if (u.protocol === "https:" && !u.username && !u.password) return u.href;
  } catch {
    /* no unsafe URL */
  }
};
export function resultEntities(data: unknown): Obj[] {
  const root = object(data),
    results = root.results;
  const list = Array.isArray(results) ? results : object(results).entities;
  if (!Array.isArray(list))
    throw new ServiceError(
      "PROVIDER_SHAPE",
      "Qloo returned an unrecognized response. No ranking was inferred.",
      502,
    );
  return list
    .map(object)
    .filter(
      (e) => typeof e.entity_id === "string" && typeof e.name === "string",
    );
}
function image(e: Obj) {
  const p = object(e.properties);
  const images = Array.isArray(p.images) ? p.images : [];
  return (
    safeUrl(object(images[0]).url) ??
    safeUrl(object(p.image).url) ??
    safeUrl(p.image)
  );
}
export function referenceFrom(
  e: Obj,
  kind: Reference["kind"],
): Reference | null {
  const types = [...(Array.isArray(e.types) ? e.types : []), e.subtype, e.type];
  if (!types.includes(`urn:entity:${kind}`)) return null;
  const p = object(e.properties);
  return {
    id: e.entity_id as string,
    name: e.name as string,
    kind,
    description: text(p.description ?? p.short_description, 1000),
    year: number(p.release_year ?? p.year),
    image: image(e),
  };
}
export function placeFrom(e: Obj): Place | null {
  const p = object(e.properties),
    l = object(e.location);
  const lat = number(l.lat),
    lon = number(l.lon);
  if (
    lat === undefined ||
    lon === undefined ||
    lat < 40.49 ||
    lat > 40.93 ||
    lon < -74.27 ||
    lon > -73.68 ||
    p.is_closed === true
  )
    return null;
  const category = text(object(p.primary_genre).name, 120);
  if (category && /private residence|residential building/i.test(category))
    return null;
  return {
    id: e.entity_id as string,
    name: e.name as string,
    description:
      text(p.description ?? p.short_description, 1200) ??
      "Qloo supplied this place without a description. Check its current details before visiting.",
    address: text(p.address, 300),
    lat,
    lon,
    image: image(e),
    website: safeUrl(p.website),
    category,
    priceLevel: number(p.price_level ?? p.pricelevel),
  };
}

export class Qloo {
  constructor(
    private store: Store,
    private session: string,
    private ipHash: string,
    private transport: typeof fetch = fetch,
  ) {}
  async request(
    path: "/search" | "/v2/insights",
    params: Record<string, string | number>,
  ): Promise<Obj[]> {
    if (!process.env.QLOO_API_KEY)
      throw new ServiceError(
        "NOT_CONFIGURED",
        "The live provider is not configured.",
        503,
      );
    const now = new Date(),
      day = now.toISOString().slice(0, 10),
      month = day.slice(0, 7),
      second = Math.floor(now.getTime() / 1000);
    const allowed = await this.store.reserve([
      { key: `provider:month:${month}`, limit: 25000, seconds: 32 * 86400 },
      { key: `provider:day:${day}`, limit: 800, seconds: 2 * 86400 },
      { key: `provider:second:${second}`, limit: 8, seconds: 3 },
      { key: `provider:session:${this.session}`, limit: 24, seconds: 7200 },
      {
        key: `provider:ip:${this.ipHash}:${day}`,
        limit: 120,
        seconds: 2 * 86400,
      },
    ]);
    if (!allowed)
      throw new ServiceError(
        "QUOTA_REACHED",
        "The shared live-search allowance is resting. Your current shortlist still works locally. Try again later.",
        429,
      );
    const url = new URL(path, "https://hackathon.api.qloo.com");
    for (const [k, v] of Object.entries(params))
      url.searchParams.set(k, String(v));
    let response: Response;
    try {
      response = await this.transport(url, {
        headers: {
          "X-Api-Key": process.env.QLOO_API_KEY,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(22000),
      });
    } catch {
      throw new ServiceError(
        "PROVIDER_TIMEOUT",
        "Qloo did not respond in time. Retry this search; no preference was inferred.",
        504,
      );
    }
    if (!response.ok) {
      // Do not relay provider bodies, credential-bearing URLs, or headers to the browser.
      if (response.status === 429)
        throw new ServiceError(
          "PROVIDER_LIMIT",
          "Qloo is rate limiting live requests. Your current decision remains available.",
          429,
        );
      if (response.status === 401 || response.status === 403)
        throw new ServiceError(
          "PROVIDER_AUTH",
          "Live provider access needs attention. No recorded result has been substituted.",
          503,
        );
      throw new ServiceError(
        "PROVIDER_ERROR",
        "Qloo could not complete this request. Please try again.",
        502,
      );
    }
    let raw: unknown;
    try {
      const body = await response.text();
      if (body.length > 2500000) throw new Error();
      raw = JSON.parse(body);
    } catch {
      throw new ServiceError(
        "PROVIDER_SHAPE",
        "Qloo returned an unreadable response.",
        502,
      );
    }
    return resultEntities(raw);
  }
  async resolve(query: string, kind: Reference["kind"]) {
    const results = await this.request("/search", {
      query,
      types: `urn:entity:${kind}`,
      take: 5,
    });
    return results
      .map((e) => referenceFrom(e, kind))
      .filter((x): x is Reference => x !== null);
  }
  async prepare(references: Reference[]): Promise<Evidence> {
    const lists: Obj[][] = [];
    // At most two calls concurrently. Each attempt reserves quota before transmission.
    for (let start = 0; start < references.length; start += 2) {
      const batch = await Promise.all(
        references
          .slice(start, start + 2)
          .map((r) =>
            this.request("/v2/insights", {
              "filter.type": "urn:entity:place",
              "signal.interests.entities": r.id,
              "filter.location.query": "New York City",
              take: 10,
              "feature.explainability": "true",
            }),
          ),
      );
      lists.push(...batch);
    }
    const pool: Place[] = [],
      all = new Set(lists.flat().map((x) => x.entity_id));
    for (let row = 0; row < 10; row++)
      for (const list of lists) {
        const raw = list[row];
        if (!raw) continue;
        const p = placeFrom(raw);
        if (p && pool.length < 10 && !pool.some((x) => x.id === p.id))
          pool.push(p);
      }
    if (pool.length < 6)
      throw new ServiceError(
        "INSUFFICIENT_EVIDENCE",
        "These references did not yield six eligible New York places. Change a reference and try again.",
        422,
      );
    const filter = pool.map((p) => p.id).join(",");
    const ranks: string[][] = [];
    const signals = [
      ...references.map((r) => r.id),
      references.map((r) => r.id).join(","),
    ];
    for (let start = 0; start < signals.length; start += 2) {
      const batch = await Promise.all(
        signals
          .slice(start, start + 2)
          .map((signal) =>
            this.request("/v2/insights", {
              "filter.type": "urn:entity:place",
              "filter.results.entities": filter,
              "signal.interests.entities": signal,
              take: pool.length,
            }),
          ),
      );
      for (const ranked of batch)
        ranks.push([
          ...new Set(
            ranked
              .map((x) => x.entity_id as string)
              .filter((id) => pool.some((p) => p.id === id)),
          ),
        ]);
    }
    const directOrder = ranks.pop()!;
    const common = pool.filter((p) => ranks.every((r) => r.includes(p.id)));
    if (common.length < 6)
      throw new ServiceError(
        "INSUFFICIENT_EVIDENCE",
        "The cultural rankings have too little shared coverage. Missing results were kept separate from dislikes.",
        422,
      );
    const now = Date.now();
    return {
      schema: 1,
      id: randomUUID(),
      retrievedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
      area: "nyc",
      references,
      places: common,
      ranks: ranks.map((r) =>
        r.filter((id) => common.some((p) => p.id === id)),
      ),
      directOrder: directOrder.filter((id) => common.some((p) => p.id === id)),
      coverage: {
        discovered: all.size,
        admitted: pool.length,
        common: common.length,
        excluded: all.size - pool.length,
        missing: pool.length - common.length,
      },
      source: "live-qloo",
      workflow: "direct-api/insights-v2",
    };
  }
}
