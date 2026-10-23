import type { Answer, Decision, Evidence, Question } from "./types.ts";

export const MODEL = "finite-rank-voi/1.0.0";
export const NOISE = 0.18;
export const MAX_COMPARISONS = 3;
export const QUESTION_COST = 0.002;
export type RankTransform = "linear" | "squared" | "sqrt";

export function simplex(dimensions: number, units = 10): number[][] {
  if (dimensions < 2 || dimensions > 3)
    throw new Error("Two or three references required.");
  const out: number[][] = [];
  function visit(prefix: number[], left: number) {
    if (prefix.length === dimensions - 1) {
      out.push([...prefix, left].map((x) => x / units));
      return;
    }
    for (let n = 0; n <= left; n++) visit([...prefix, n], left - n);
  }
  visit([], units);
  return out;
}

export function features(
  e: Evidence,
  transform: RankTransform = "linear",
): number[][] {
  const ids = e.places.map((p) => p.id);
  return ids.map((id) =>
    e.ranks.map((rank) => {
      const covered = rank.filter((x) => ids.includes(x));
      const position = covered.indexOf(id);
      if (position < 0)
        throw new Error("Missing rank cannot be interpreted as dislike.");
      const value =
        covered.length < 2
          ? 1
          : (covered.length - 1 - position) / (covered.length - 1);
      return transform === "squared"
        ? value ** 2
        : transform === "sqrt"
          ? Math.sqrt(value)
          : value;
    }),
  );
}

export const dot = (a: number[], b: number[]) =>
  a.reduce((s, x, i) => s + x * b[i], 0);
export const logistic = (x: number) =>
  1 / (1 + Math.exp(-Math.max(-60, Math.min(60, x))));

export function buildModel(
  e: Evidence,
  answers: Answer[],
  noise = NOISE,
  transform: RankTransform = "linear",
) {
  const fs = features(e, transform),
    hypotheses = simplex(e.references.length);
  const utility = hypotheses.map((w) => fs.map((f) => dot(w, f)));
  const logPosterior = hypotheses.map(() => -Math.log(hypotheses.length));
  const vetoes = new Set<string>();
  for (const answer of answers) {
    const a = e.places.findIndex((p) => p.id === answer.a),
      b = e.places.findIndex((p) => p.id === answer.b);
    if (a < 0 || b < 0 || a === b)
      throw new Error("Comparison is outside this evidence.");
    if (answer.choice === "neither") {
      vetoes.add(answer.a);
      vetoes.add(answer.b);
    }
    if (answer.choice !== "a" && answer.choice !== "b") continue;
    utility.forEach((u, h) => {
      const likelihood = logistic((u[a] - u[b]) / noise);
      logPosterior[h] += Math.log(
        Math.max(1e-14, answer.choice === "a" ? likelihood : 1 - likelihood),
      );
    });
  }
  const shift = Math.max(...logPosterior),
    unnormalized = logPosterior.map((x) => Math.exp(x - shift));
  const total = unnormalized.reduce((a, b) => a + b, 0);
  const posterior = unnormalized.map((x) => x / total);
  const eligible = e.places
    .map((p, i) => (vetoes.has(p.id) ? -1 : i))
    .filter((i) => i >= 0);
  return { fs, hypotheses, utility, posterior, eligible, vetoes };
}

export function expectedRegret(
  utility: number[][],
  posterior: number[],
  eligible: number[],
): number {
  if (eligible.length < 2) return 0;
  const bestEach = utility.map((u) => Math.max(...eligible.map((i) => u[i])));
  return Math.max(
    0,
    Math.min(
      ...eligible.map((i) =>
        posterior.reduce((s, p, h) => s + p * (bestEach[h] - utility[h][i]), 0),
      ),
    ),
  );
}

export function questionValue(
  utility: number[][],
  posterior: number[],
  eligible: number[],
  a: number,
  b: number,
  noise = NOISE,
) {
  const likelihoods = utility.map((u) => logistic((u[a] - u[b]) / noise));
  const probabilityA = dot(posterior, likelihoods);
  const afterA = posterior.map((p, h) => (p * likelihoods[h]) / probabilityA);
  const afterB = posterior.map(
    (p, h) => (p * (1 - likelihoods[h])) / (1 - probabilityA),
  );
  const value =
    expectedRegret(utility, posterior, eligible) -
    probabilityA * expectedRegret(utility, afterA, eligible) -
    (1 - probabilityA) * expectedRegret(utility, afterB, eligible);
  return { value: Math.max(0, value), probabilityA, afterA, afterB };
}

export function advise(
  e: Evidence,
  answers: Answer[] = [],
  options: {
    manualWeights?: number[];
    noise?: number;
    transform?: RankTransform;
  } = {},
): Decision {
  if (
    answers.length > 8 ||
    answers.filter((a) => a.choice === "a" || a.choice === "b").length >
      MAX_COMPARISONS
  )
    throw new Error("The interaction or relative-answer limit is exceeded.");
  const noise = options.noise ?? NOISE;
  const m = buildModel(e, answers, noise, options.transform);
  const { utility, eligible, hypotheses, vetoes } = m;
  let posterior = m.posterior;
  if (options.manualWeights) {
    const w = options.manualWeights;
    if (
      w.length !== e.references.length ||
      w.some((x) => !Number.isFinite(x) || x < 0) ||
      Math.abs(w.reduce((a, b) => a + b, 0) - 1) > 0.001
    )
      throw new Error("Weights must sum to one.");
    const nearest = hypotheses.reduce(
      (best, h, i) =>
        h.reduce((s, x, j) => s + (x - w[j]) ** 2, 0) <
        hypotheses[best].reduce((s, x, j) => s + (x - w[j]) ** 2, 0)
          ? i
          : best,
      0,
    );
    posterior = hypotheses.map((_, i) => (i === nearest ? 1 : 0));
  }
  const weights = e.references.map((_, j) =>
    posterior.reduce((s, p, h) => s + p * hypotheses[h][j], 0),
  );
  const ranking = eligible
    .map((i) => ({
      id: e.places[i].id,
      score: posterior.reduce((s, p, h) => s + p * utility[h][i], 0),
      features: m.fs[i],
      directRank: e.directOrder.includes(e.places[i].id)
        ? e.directOrder.indexOf(e.places[i].id) + 1
        : null,
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const regret = expectedRegret(utility, posterior, eligible);
  const seen = new Set(answers.map((x) => [x.a, x.b].sort().join(":")));
  let question: Question | null = null;
  for (let i = 0; i < eligible.length; i++)
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i],
        b = eligible[j];
      if (seen.has([e.places[a].id, e.places[b].id].sort().join(":"))) continue;
      const value = questionValue(utility, posterior, eligible, a, b, noise);
      if (!question || value.value > question.value + 1e-12)
        question = {
          a: e.places[a].id,
          b: e.places[b].id,
          value: value.value,
          probabilityA: value.probabilityA,
        };
    }
  const answered = answers.filter(
    (x) => x.choice === "a" || x.choice === "b",
  ).length;
  const repeatedSkips =
    answers.length >= 2 && answers.slice(-2).every((x) => x.choice === "skip");
  let status: Decision["status"] = "clarify",
    reason = "A comparison could change your shortlist.";
  if (!eligible.length) {
    status = "exhausted";
    reason =
      "Every current option has been ruled out. Undo a veto or try different references.";
  } else if (e.places.length < 6) {
    status = "insufficient";
    reason =
      "Fewer than six places have complete cultural evidence. Try a different reference.";
  } else if (options.manualWeights) {
    status = "recommend";
    reason = "You set this balance explicitly. It is not a learned preference.";
  } else if (answered >= MAX_COMPARISONS) {
    status = "recommend";
    reason =
      "Your three-comparison limit is reached. Here is the current shortlist.";
  } else if (repeatedSkips) {
    status = "recommend";
    reason =
      "Two comparisons were skipped. Here is the available shortlist; your preference remains uncertain.";
  } else if (answers.length >= 8) {
    status = "recommend";
    reason =
      "The interaction limit is reached. You can review or change any answer.";
  } else if (!question || question.value <= QUESTION_COST) {
    status = "recommend";
    reason =
      "No remaining comparison clears the declared modeled-benefit threshold.";
  }
  if (status !== "clarify") question = null;
  const topChoices = new Set(
    utility.map((u) =>
      eligible.reduce(
        (best, i) => (u[i] > u[best] ? i : best),
        eligible[0] ?? 0,
      ),
    ),
  );
  return {
    model: MODEL,
    status,
    reason,
    ranking,
    question,
    weights,
    regret,
    answered,
    vetoes: [...vetoes],
    posterior,
    disagreement: topChoices.size,
  };
}
