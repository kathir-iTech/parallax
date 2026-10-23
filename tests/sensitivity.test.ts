import test from "node:test";
import assert from "node:assert/strict";
import { advise, QUESTION_COST } from "../core/engine.ts";
import { fixture } from "./fixture.ts";

test("alternate rank transforms and noise scales agree with an independent finite oracle", () => {
  const evidence = fixture(2);
  for (const transform of ["linear", "squared", "sqrt"] as const) {
    const convert = (x: number) =>
      transform === "squared" ? x * x : transform === "sqrt" ? Math.sqrt(x) : x;
    // Explicit fixture ranks, independently formed weights and utilities.
    const utility = Array.from({ length: 11 }, (_, k) =>
      Array.from(
        { length: 8 },
        (_, i) =>
          (k / 10) * convert((7 - i) / 7) + (1 - k / 10) * convert(i / 7),
      ),
    );
    function loss(p: number[]) {
      let best = Infinity;
      for (let action = 0; action < 8; action++) {
        let value = 0;
        for (let h = 0; h < 11; h++)
          value += p[h] * (Math.max(...utility[h]) - utility[h][action]);
        best = Math.min(best, value);
      }
      return best;
    }
    const prior = Array.from({ length: 11 }, () => 1 / 11);
    for (const noise of [0.08, 0.18, 0.5]) {
      let maximum = 0;
      for (let a = 0; a < 8; a++)
        for (let b = a + 1; b < 8; b++) {
          const likelihood = utility.map(
            (u) => 1 / (1 + Math.exp(-(u[a] - u[b]) / noise)),
          );
          const probabilityA = likelihood.reduce((sum, x) => sum + x / 11, 0);
          const afterA = likelihood.map((x) => x / 11 / probabilityA);
          const afterB = likelihood.map(
            (x) => (1 - x) / 11 / (1 - probabilityA),
          );
          maximum = Math.max(
            maximum,
            loss(prior) -
              probabilityA * loss(afterA) -
              (1 - probabilityA) * loss(afterB),
          );
        }
      const result = advise(evidence, [], { transform, noise });
      if (maximum > QUESTION_COST) {
        assert.ok(result.question, `${transform}, noise ${noise}`);
        assert.ok(Math.abs(result.question.value - maximum) < 1e-10);
      } else assert.equal(result.question, null);
      assert.ok(result.weights.every(Number.isFinite));
    }
  }
});
