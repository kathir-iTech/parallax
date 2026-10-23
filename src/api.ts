import type { Answer, Decision, Evidence, Reference } from "../core/types.ts";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
let token: string | null = null;
let sessionPending: Promise<string> | null = null;
try {
  token = sessionStorage.getItem("parallax:session");
} catch {
  /* storage can be unavailable */
}
async function request<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  retry = true,
): Promise<T> {
  if (!token && path !== "session") {
    if (!sessionPending)
      sessionPending = request<{ token: string }>("session", {}, signal)
        .then((s) => s.token)
        .finally(() => {
          sessionPending = null;
        });
    token = await sessionPending;
    try {
      sessionStorage.setItem("parallax:session", token);
    } catch {
      /* memory-only session */
    }
  }
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(
      "UNREADABLE",
      "The server returned an unreadable response. Please try again.",
    );
  }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string } }).error;
    if (err?.code === "SESSION_EXPIRED" && retry) {
      token = null;
      try {
        sessionStorage.removeItem("parallax:session");
      } catch {
        /* memory only */
      }
      return request<T>(path, body, signal, false);
    }
    throw new ApiError(
      err?.code ?? "NETWORK",
      err?.message ?? "The request could not be completed.",
    );
  }
  return data as T;
}
export const resolveReferences = (
  query: string,
  kind: Reference["kind"],
  signal?: AbortSignal,
) => request<{ references: Reference[] }>("resolve", { query, kind }, signal);
export const prepare = (references: Reference[], signal?: AbortSignal) =>
  request<{ evidence: Evidence; decision: Decision }>(
    "prepare",
    { area: "nyc", references },
    signal,
  );
export const remoteAdvise = (evidenceId: string, answers: Answer[]) =>
  request<{ decision: Decision }>("advise", { evidenceId, answers });
export const forgetEvidence = (evidenceId: string) =>
  request<{ removed: boolean }>("forget", { evidenceId });
