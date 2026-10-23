import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Reference } from "../core/types.ts";
import { ServiceError, referenceSchema } from "./schema.ts";
export function sign(data: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new ServiceError(
      "NOT_CONFIGURED",
      "The live service is not configured.",
      503,
    );
  return createHmac("sha256", secret).update(data).digest("base64url");
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function mintSession() {
  const payload = `${randomUUID()}.${Date.now() + 7200000}`;
  return `${payload}.${sign(payload)}`;
}
export function sessionId(token: string) {
  if (token.length > 220)
    throw new ServiceError(
      "SESSION_EXPIRED",
      "Please start a fresh live session.",
      401,
    );
  const parts = token.split("."),
    payload = parts.slice(0, 2).join(".");
  if (
    parts.length !== 3 ||
    !equal(sign(payload), parts[2]) ||
    !Number.isFinite(Number(parts[1])) ||
    Number(parts[1]) < Date.now()
  )
    throw new ServiceError(
      "SESSION_EXPIRED",
      "Your live session expired. Start a fresh search; saved preferences remain local.",
      401,
    );
  return parts[0];
}
export function proveReference(ref: Reference): Reference {
  const payload = Buffer.from(
    JSON.stringify({ ref, expires: Date.now() + 86400000 }),
  ).toString("base64url");
  return { ...ref, proof: `${payload}.${sign(payload)}` };
}
export function verifyReference(ref: Reference): Reference {
  const [payload, sig] = ref.proof?.split(".") ?? [];
  if (!payload || !sig || !equal(sign(payload), sig))
    throw new ServiceError(
      "UNCONFIRMED_REFERENCE",
      "Search and confirm each cultural identity before continuing.",
      422,
    );
  let d: { ref: Reference; expires: number };
  try {
    d = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as typeof d;
  } catch {
    throw new ServiceError(
      "UNCONFIRMED_REFERENCE",
      "Resolve this identity again.",
      422,
    );
  }
  if (d.expires < Date.now())
    throw new ServiceError(
      "UNCONFIRMED_REFERENCE",
      "This cultural identity needs a fresh search.",
      422,
    );
  const canonical = referenceSchema.parse(d.ref);
  if (canonical.id !== ref.id || canonical.kind !== ref.kind)
    throw new ServiceError(
      "UNCONFIRMED_REFERENCE",
      "The confirmed identity does not match this request.",
      422,
    );
  return canonical;
}
