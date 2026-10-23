import type { Evidence } from "../core/types.ts";
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function fixture(dimensions = 2): Evidence {
  const places = Array.from({ length: 8 }, (_, i) => ({
    id: id(i + 1),
    name: `Synthetic place ${i + 1}`,
    description: "Authored test data; not a real provider observation.",
    lat: 40.75 + i * 0.003,
    lon: -73.98,
  }));
  return {
    schema: 1,
    id: id(100),
    area: "nyc",
    retrievedAt: "2026-10-22T00:00:00.000Z",
    expiresAt: "2026-10-22T00:30:00.000Z",
    references: Array.from({ length: dimensions }, (_, i) => ({
      id: id(20 + i),
      name: `Test reference ${i + 1}`,
      kind: i === 1 ? "movie" : "artist",
    })),
    places,
    ranks: [
      places.map((x) => x.id),
      [...places].reverse().map((x) => x.id),
      [2, 4, 0, 6, 1, 7, 3, 5].map((i) => places[i].id),
    ].slice(0, dimensions),
    directOrder: [3, 4, 2, 5, 1, 6, 0, 7].map((i) => places[i].id),
    coverage: {
      discovered: 8,
      admitted: 8,
      common: 8,
      excluded: 0,
      missing: 0,
    },
    source: "live-qloo",
    workflow: "direct-api/insights-v2",
  };
}
