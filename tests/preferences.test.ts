import { test } from "node:test";
import assert from "node:assert/strict";
import { importSchema } from "../src/storage.ts";

test("preference imports retain explicit balance, support legacy files and reject invalid dimensions", () => {
  const input = {
    schema: 1,
    area: "nyc",
    exportedAt: new Date().toISOString(),
    answers: [],
    references: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Artist",
        kind: "artist",
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Film",
        kind: "movie",
      },
    ],
  };
  assert.equal(importSchema.safeParse(input).success, true);
  assert.deepEqual(
    importSchema.parse({ ...input, manualWeights: [0.6, 0.4] }).manualWeights,
    [0.6, 0.4],
  );
  for (const manualWeights of [
    [0.6, 0.6],
    [0.5, 0.25, 0.25],
    [-0.1, 1.1],
    [NaN, 0.5],
  ]) {
    assert.equal(
      importSchema.safeParse({ ...input, manualWeights }).success,
      false,
    );
  }
});
