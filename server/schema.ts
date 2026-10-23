import { z } from "zod";
export const uuid = z.string().uuid();
export const referenceSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["artist", "movie"]),
  description: z.string().max(1500).optional(),
  year: z.number().int().min(1800).max(2100).optional(),
  image: z.url().max(1500).optional(),
  proof: z.string().max(6500).optional(),
});
export const answerSchema = z.object({
  id: uuid,
  a: uuid,
  b: uuid,
  choice: z.enum(["a", "b", "both", "neither", "skip"]),
});
export const answersSchema = z
  .array(answerSchema)
  .max(8)
  .refine(
    (xs) => new Set(xs.map((x) => x.id)).size === xs.length,
    "Duplicate answer IDs.",
  )
  .refine(
    (xs) => xs.filter((x) => x.choice === "a" || x.choice === "b").length <= 3,
    "At most three relative answers.",
  );
export const prepareSchema = z
  .object({
    area: z.literal("nyc"),
    references: z.array(referenceSchema).min(2).max(3),
  })
  .refine(
    (x) => new Set(x.references.map((r) => r.id)).size === x.references.length,
    "Choose distinct references.",
  );
export const resolveSchema = z.object({
  query: z.string().trim().min(2).max(100),
  kind: z.enum(["artist", "movie"]),
});
export const adviseSchema = z.object({
  evidenceId: uuid,
  answers: answersSchema,
});
export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
