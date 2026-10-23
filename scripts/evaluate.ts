import { mkdirSync, writeFileSync } from "node:fs";
import {
  advise,
  buildModel,
  features,
  logistic,
  questionValue,
} from "../core/engine.ts";
import type { Answer, Evidence } from "../core/types.ts";
import { fixture, id } from "../tests/fixture.ts";

// Frozen before interpreting output. Synthetic ordinal fixture only, not a human study.
const SEEDS = 40,
  BUDGET = 3;
const families = [
  "matched",
  "nonlinear",
  "noisy",
  "context-change",
  "unfamiliar",
] as const;
const policies = [
  "voi",
  "entropy",
  "uncertainty",
  "random",
  "fixed",
  "equal-no-questions",
  "direct-no-questions",
  "first-lens-ablation",
] as const;
type Policy = (typeof policies)[number];
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
}
function entropy(p: number[]) {
  return -p.reduce((s, x) => s + (x > 0 ? x * Math.log(x) : 0), 0);
}
function select(
  e: Evidence,
  answers: Answer[],
  policy: Policy,
  random: () => number,
): [number, number] | null {
  const m = buildModel(e, answers),
    seen = new Set(answers.map((a) => [a.a, a.b].sort().join(":")));
  if (policy === "voi") {
    const q = advise(e, answers).question;
    return q
      ? [
          e.places.findIndex((p) => p.id === q.a),
          e.places.findIndex((p) => p.id === q.b),
        ]
      : null;
  }
  const pairs: [number, number][] = [];
  for (let a = 0; a < e.places.length; a++)
    for (let b = a + 1; b < e.places.length; b++)
      if (!seen.has([e.places[a].id, e.places[b].id].sort().join(":")))
        pairs.push([a, b]);
  if (!pairs.length) return null;
  if (policy === "random") return pairs[Math.floor(random() * pairs.length)];
  if (policy === "fixed") return pairs[0];
  let best = pairs[0],
    value = -Infinity;
  for (const pair of pairs) {
    const q = questionValue(m.utility, m.posterior, m.eligible, ...pair);
    const score =
      policy === "entropy"
        ? entropy(m.posterior) -
          q.probabilityA * entropy(q.afterA) -
          (1 - q.probabilityA) * entropy(q.afterB)
        : -Math.abs(0.5 - q.probabilityA);
    if (score > value + 1e-12) {
      value = score;
      best = pair;
    }
  }
  return best;
}
const rows: {
  family: string;
  policy: string;
  seed: number;
  regret: number;
  questions: number;
  relative: number;
  abstention: number;
}[] = [];
for (const family of families)
  for (let seed = 1; seed <= SEEDS; seed++) {
    const e = fixture(2),
      fs = features(e),
      random = rng(seed * 3901),
      weight = random(),
      afterWeight = random();
    const disturbances = Array.from({ length: 8 }, () => random()),
      skips = Array.from({ length: 8 }, () => random());
    for (const policy of policies) {
      const answers: Answer[] = [],
        chooseRandom = rng(seed * 5431);
      let questions = 0,
        relative = 0;
      const truth = (i: number, step: number) => {
        const w =
          family === "context-change" && step >= 1 ? afterWeight : weight;
        return family === "nonlinear"
          ? w * fs[i][0] ** 2 + (1 - w) * Math.sqrt(fs[i][1])
          : w * fs[i][0] + (1 - w) * fs[i][1];
      };
      if (["voi", "entropy", "uncertainty", "random", "fixed"].includes(policy))
        for (let step = 0; step < BUDGET; step++) {
          const pair = select(e, answers, policy, chooseRandom);
          if (!pair) break;
          const [a, b] = pair;
          questions++;
          const skip = family === "unfamiliar" && skips[step] < 0.4;
          const probability = logistic(
            (truth(a, step) - truth(b, step)) /
              (family === "noisy" ? 0.5 : 0.18),
          );
          const choice = skip
            ? "skip"
            : disturbances[step] < probability
              ? "a"
              : "b";
          if (choice !== "skip") relative++;
          answers.push({
            id: id(800 + step),
            a: e.places[a].id,
            b: e.places[b].id,
            choice,
          });
          if (
            answers.length >= 2 &&
            answers.slice(-2).every((x) => x.choice === "skip")
          )
            break;
        }
      const d = advise(e, answers);
      let chosen = e.places.findIndex((p) => p.id === d.ranking[0].id);
      if (policy === "direct-no-questions")
        chosen = e.places.findIndex((p) => p.id === e.directOrder[0]);
      if (policy === "first-lens-ablation")
        chosen = e.places.findIndex((p) => p.id === e.ranks[0][0]);
      const utilities = e.places.map((_, i) => truth(i, BUDGET));
      rows.push({
        family,
        policy,
        seed,
        regret: Math.max(...utilities) - utilities[chosen],
        questions,
        relative,
        abstention: questions - relative,
      });
    }
  }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const report = families.flatMap((family) =>
  policies.map((policy) => {
    const r = rows.filter((x) => x.family === family && x.policy === policy),
      losses = r.map((x) => x.regret),
      avg = mean(losses);
    return {
      family,
      policy,
      n: r.length,
      meanSyntheticRegret: +avg.toFixed(5),
      standardError: +Math.sqrt(
        losses.reduce((s, x) => s + (x - avg) ** 2, 0) /
          (r.length - 1) /
          r.length,
      ).toFixed(5),
      meanQuestions: +mean(r.map((x) => x.questions)).toFixed(3),
      meanRelativeAnswers: +mean(r.map((x) => x.relative)).toFixed(3),
      meanSkips: +mean(r.map((x) => x.abstention)).toFixed(3),
    };
  }),
);
mkdirSync("docs/evaluation", { recursive: true });
writeFileSync(
  "docs/evaluation/synthetic.json",
  JSON.stringify(
    {
      protocol: "synthetic-ordinal-v1",
      seedCount: SEEDS,
      budget: BUDGET,
      executions: rows.length,
      scope:
        "Authored 8-item rank fixture, two cultural dimensions. Simulated choices only; no human or provider quality claim.",
      report,
    },
    null,
    2,
  ),
);
const text = [
  "# Frozen synthetic comparison protocol and results",
  "",
  "This report uses an authored ordinal fixture, not a dataset of human place choices. Regret is measured against each simulated utility generator. It does not establish real enjoyment, Qloo superiority, novelty, or a winning probability.",
  "",
  `Protocol: 5 predeclared families × ${SEEDS} fixed seeds × ${policies.length} policies = ${rows.length} executions. At most ${BUDGET} interactions; skipped comparisons count. VOI may stop earlier at the declared modeled-benefit threshold. Other selectors share the same prior, likelihood, evidence, and interaction cap. No-question controls use zero answers; costs are reported rather than hidden.`,
  "",
  "The first-lens ablation removes the second cultural feature; it is not a genre-only or non-Qloo recommendation system. The direct baseline in this synthetic fixture is an authored ordering, not a live Qloo result. Live-case evidence is reported separately. Explicit weighting is exposed as a product control but no oracle-weight result is presented as a fair interactive baseline.",
  "",
  "| Generator | Policy | Mean simulated regret | SE | Questions | Skips |",
  "|---|---|---:|---:|---:|---:|",
  ...report.map(
    (r) =>
      `| ${r.family} | ${r.policy} | ${r.meanSyntheticRegret} | ${r.standardError} | ${r.meanQuestions} | ${r.meanSkips} |`,
  ),
  "",
  "Matched: linear rank utility and matching noise. Nonlinear: squared/square-root per-lens utility. Noisy: higher response noise. Context-change: weight changes after first interaction. Unfamiliar: 40% skip probability.",
  "",
  "Interpretations must retain ties, losses, and model mismatch. This is engineering stress evidence, not independent human validation.",
];
writeFileSync("docs/evaluation/SYNTHETIC.md", text.join("\n"));
console.log(
  JSON.stringify({
    executions: rows.length,
    report: "docs/evaluation/SYNTHETIC.md",
    claim: "synthetic stress only",
  }),
);
