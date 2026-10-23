export type Reference = {
  id: string;
  name: string;
  kind: "artist" | "movie";
  description?: string;
  year?: number;
  image?: string;
  proof?: string;
};
export type Place = {
  id: string;
  name: string;
  description: string;
  address?: string;
  lat: number;
  lon: number;
  image?: string;
  website?: string;
  category?: string;
  priceLevel?: number;
};
export type Evidence = {
  schema: 1;
  id: string;
  retrievedAt: string;
  expiresAt: string;
  area: "nyc";
  references: Reference[];
  places: Place[];
  ranks: string[][];
  directOrder: string[];
  coverage: {
    discovered: number;
    admitted: number;
    common: number;
    excluded: number;
    missing: number;
  };
  source: "live-qloo";
  workflow: "direct-api/insights-v2";
};
export type Choice = "a" | "b" | "both" | "neither" | "skip";
export type Answer = { id: string; a: string; b: string; choice: Choice };
export type Question = {
  a: string;
  b: string;
  value: number;
  probabilityA: number;
};
export type Decision = {
  model: string;
  status: "clarify" | "recommend" | "exhausted" | "insufficient";
  reason: string;
  ranking: {
    id: string;
    score: number;
    features: number[];
    directRank: number | null;
  }[];
  question: Question | null;
  weights: number[];
  regret: number;
  answered: number;
  vetoes: string[];
  posterior: number[];
  disagreement: number;
};
export type Profile = {
  schema: 1;
  revision: number;
  area: "nyc";
  references: Reference[];
  answers: Answer[];
  evidence: Evidence | null;
  savedAt: string;
  mode: "live" | "restored";
};
