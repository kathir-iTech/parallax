import test from "node:test";
import assert from "node:assert/strict";
import {
  advise,
  buildModel,
  features,
  questionValue,
  simplex,
} from "../core/engine.ts";
import type { Answer } from "../core/types.ts";
import { fixture, id } from "./fixture.ts";

test("simplex enumerates the declared finite models", () => {
  assert.equal(simplex(2).length, 11);
  assert.equal(simplex(3).length, 66);
  for (const w of simplex(3))
    assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});
test("independent exhaustive oracle agrees with question values and selected maximum", () => {
  const e = fixture(3),
    m = buildModel(e, []),
    d = advise(e, []);
  // Independently enumerate action losses and answer branches; do not call production regret.
  function loss(prob: number[]) {
    let best = Infinity;
    for (const action of m.eligible) {
      let s = 0;
      for (let h = 0; h < prob.length; h++) {
        let optimum = -Infinity;
        for (const c of m.eligible)
          optimum = Math.max(optimum, m.utility[h][c]);
        s += prob[h] * (optimum - m.utility[h][action]);
      }
      best = Math.min(best, s);
    }
    return best;
  }
  let max = -Infinity;
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) {
      const probs = m.utility.map(
        (u) =>
          Math.exp(u[a] / 0.18) /
          (Math.exp(u[a] / 0.18) + Math.exp(u[b] / 0.18)),
      );
      let pa = 0;
      for (let h = 0; h < probs.length; h++) pa += m.posterior[h] * probs[h];
      const branchA = m.posterior.map((p, h) => (p * probs[h]) / pa),
        branchB = m.posterior.map((p, h) => (p * (1 - probs[h])) / (1 - pa));
      const oracle =
        loss(m.posterior) - pa * loss(branchA) - (1 - pa) * loss(branchB);
      assert.ok(
        Math.abs(
          questionValue(m.utility, m.posterior, m.eligible, a, b).value -
            oracle,
        ) < 1e-10,
      );
      max = Math.max(max, oracle);
    }
  assert.ok(d.question);
  assert.ok(Math.abs(d.question.value - max) < 1e-10);
});
test("answer removal exactly matches a fresh retained-input rebuild", () => {
  const e = fixture(),
    a: Answer = {
      id: id(301),
      a: e.places[0].id,
      b: e.places[7].id,
      choice: "a",
    },
    b: Answer = {
      id: id(302),
      a: e.places[1].id,
      b: e.places[6].id,
      choice: "b",
    };
  const old = advise(e, [a, b]);
  const corrected = advise(e, [b]);
  assert.notDeepEqual(old.posterior, corrected.posterior);
  const fresh = advise(
    structuredClone(e),
    JSON.parse(JSON.stringify([b])) as Answer[],
  );
  assert.deepEqual(corrected, fresh);
});
test("nonrelative choices do not invent pairwise preference; neither is a hard reversible veto", () => {
  const e = fixture(),
    base = advise(e, []);
  for (const choice of ["both", "skip", "neither"] as const) {
    const d = advise(e, [
      { id: id(310), a: e.places[0].id, b: e.places[7].id, choice },
    ]);
    assert.deepEqual(d.posterior, base.posterior);
    if (choice === "neither")
      assert.ok(
        d.ranking.every(
          (x) => x.id !== e.places[0].id && x.id !== e.places[7].id,
        ),
      );
  }
});
test("two consecutive skips stop; comparison cap and exhaustion are explicit", () => {
  const e = fixture();
  const pair = (n: number, choice: Answer["choice"]): Answer => ({
    id: id(400 + n),
    a: e.places[n % 4].id,
    b: e.places[7 - (n % 4)].id,
    choice,
  });
  assert.equal(
    advise(e, [pair(0, "skip"), pair(1, "skip")]).status,
    "recommend",
  );
  assert.equal(
    advise(e, [pair(0, "a"), pair(1, "b"), pair(2, "a")]).answered,
    3,
  );
  assert.equal(
    advise(e, [pair(0, "a"), pair(1, "b"), pair(2, "a")]).question,
    null,
  );
  assert.equal(
    advise(
      e,
      [0, 1, 2, 3].map((n) => pair(n, "neither")),
    ).status,
    "exhausted",
  );
});
test("identical reference rankings do not manufacture clarification", () => {
  const e = fixture();
  e.ranks[1] = [...e.ranks[0]];
  assert.equal(advise(e).status, "recommend");
  assert.equal(advise(e).question, null);
});
test("missing rank is rejected rather than converted to a low score", () => {
  const e = fixture();
  e.ranks[0].pop();
  assert.throws(() => features(e), /Missing rank/);
});
test("extreme repeated contradictory evidence remains normalized and deterministic", () => {
  const e = fixture(),
    answers = Array.from(
      { length: 3 },
      (_, i) =>
        ({
          id: id(500 + i),
          a: e.places[0].id,
          b: e.places[7].id,
          choice: i % 2 ? "a" : "b",
        }) as Answer,
    );
  const d = advise(e, answers);
  assert.ok(Math.abs(d.posterior.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(d.posterior.every(Number.isFinite));
  assert.deepEqual(d, advise(e, answers));
  assert.throws(
    () => advise(e, [...answers, { ...answers[0], id: id(999) }]),
    /limit/,
  );
});
