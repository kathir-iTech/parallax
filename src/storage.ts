import { get, set, del } from "idb-keyval";
import { z } from "zod";
import { answersSchema, referenceSchema } from "../server/schema.ts";
import type { Profile } from "../core/types.ts";
const KEY = "parallax:profile:1";
let queue = Promise.resolve();
export const loadProfile = () => get<Profile>(KEY);
export function saveProfile(profile: Profile | null) {
  queue = queue
    .catch(() => {})
    .then(() => (profile ? set(KEY, profile) : del(KEY)));
  return queue;
}
export const importSchema = z.object({
  schema: z.literal(1),
  area: z.literal("nyc"),
  references: z
    .array(referenceSchema.omit({ proof: true }))
    .min(2)
    .max(3),
  answers: answersSchema,
  exportedAt: z.string().max(60),
});
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
