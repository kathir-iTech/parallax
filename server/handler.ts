import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { advise } from "../core/engine.ts";
import {
  adviseSchema,
  prepareSchema,
  resolveSchema,
  ServiceError,
  uuid,
} from "./schema.ts";
import { databaseStore } from "./store.ts";
import type { Store } from "./store.ts";
import {
  mintSession,
  proveReference,
  sessionId,
  sign,
  verifyReference,
} from "./auth.ts";
import { Qloo } from "./qloo.ts";

type Request = IncomingMessage & { body?: unknown };
export function createHandler(injected?: Store, transport?: typeof fetch) {
  return async function handler(req: Request, res: ServerResponse) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status: number, data: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    try {
      const path = new URL(req.url ?? "/", "http://local").pathname.replace(
        /\/$/,
        "",
      );
      if (path === "/api/status" && req.method === "GET") {
        const configured = Boolean(
          process.env.QLOO_API_KEY &&
          process.env.SESSION_SECRET &&
          (injected || process.env.DATABASE_URL),
        );
        reply(200, {
          service: "PARALLAX",
          version: "1.0.0",
          configured,
          area: "nyc",
          source: "Qloo Taste AI",
          model: "finite-rank-voi/1.0.0",
        });
        return;
      }
      if (req.method !== "POST") {
        reply(405, {
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "Use POST for this operation.",
          },
        });
        return;
      }
      const origin = req.headers.origin,
        host = req.headers.host;
      if (origin && new URL(origin).host !== host)
        throw new ServiceError(
          "ORIGIN",
          "This browser origin is not allowed.",
          403,
        );
      if (!req.headers["content-type"]?.includes("application/json"))
        throw new ServiceError("CONTENT_TYPE", "Send application/json.", 415);
      if (Number(req.headers["content-length"] ?? 0) > 32000)
        throw new ServiceError("TOO_LARGE", "The request is too large.", 413);
      let body = req.body;
      if (body === undefined) {
        let raw = "";
        for await (const chunk of req) {
          raw += String(chunk);
          if (raw.length > 32000)
            throw new ServiceError(
              "TOO_LARGE",
              "The request is too large.",
              413,
            );
        }
        try {
          body = JSON.parse(raw);
        } catch {
          throw new ServiceError("INVALID_JSON", "Send valid JSON.", 400);
        }
      } else if (typeof body === "string") {
        if (body.length > 32000)
          throw new ServiceError("TOO_LARGE", "The request is too large.", 413);
        try {
          body = JSON.parse(body);
        } catch {
          throw new ServiceError("INVALID_JSON", "Send valid JSON.", 400);
        }
      }
      const store = injected ?? databaseStore();
      const ip = String(
        req.headers["x-vercel-forwarded-for"] ??
          req.headers["x-forwarded-for"] ??
          req.socket.remoteAddress ??
          "unknown",
      )
        .split(",")[0]
        .trim();
      const ipHash = sign(`ip:${ip}`).slice(0, 24),
        minute = Math.floor(Date.now() / 60000);
      if (
        !(await store.reserve([
          { key: `http:ip:${ipHash}:${minute}`, limit: 40, seconds: 120 },
          { key: `http:global:${minute}`, limit: 600, seconds: 120 },
        ]))
      )
        throw new ServiceError(
          "RATE_LIMIT",
          "Too many requests. Please take a moment and try again.",
          429,
        );
      if (path === "/api/session") {
        if (
          !(await store.reserve([
            {
              key: `session:${ipHash}:${Math.floor(Date.now() / 3600000)}`,
              limit: 8,
              seconds: 7200,
            },
          ]))
        )
          throw new ServiceError(
            "RATE_LIMIT",
            "The fresh-session allowance is reached. Try again later.",
            429,
          );
        reply(200, { token: mintSession(), expiresIn: 7200 });
        return;
      }
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      const sid = sessionId(token),
        qloo = new Qloo(store, sid, ipHash, transport);
      if (path === "/api/resolve") {
        const input = resolveSchema.parse(body);
        reply(200, {
          references: (await qloo.resolve(input.query, input.kind)).map(
            proveReference,
          ),
        });
        return;
      }
      if (path === "/api/prepare") {
        const input = prepareSchema.parse(body),
          references = input.references.map(verifyReference);
        const lease = `prepare:${sid}`;
        if (!(await store.lease(lease)))
          throw new ServiceError(
            "ALREADY_PREPARING",
            "A search is already running in this session. Wait for it to finish.",
            409,
          );
        try {
          const evidence = await qloo.prepare(references);
          await store.put(evidence, sid);
          reply(200, { evidence, decision: advise(evidence, []) });
        } finally {
          await store.unlock(lease).catch(() => {
            /* lease expires without a fail-open retry */
          });
        }
        return;
      }
      if (path === "/api/advise") {
        const input = adviseSchema.parse(body),
          record = await store.get(input.evidenceId);
        if (!record || record.session !== sid)
          throw new ServiceError(
            "EVIDENCE_EXPIRED",
            "This evidence handle has expired. Prepare fresh evidence before using the remote tool.",
            410,
          );
        const ids = new Set(record.evidence.places.map((p) => p.id));
        if (
          input.answers.some(
            (a) => !ids.has(a.a) || !ids.has(a.b) || a.a === a.b,
          )
        )
          throw new ServiceError(
            "INVALID_COMPARISON",
            "A comparison does not belong to this evidence.",
            422,
          );
        reply(200, {
          decision: advise(record.evidence, input.answers),
          evidenceId: record.evidence.id,
        });
        return;
      }
      if (path === "/api/forget") {
        const id = uuid.parse((body as Record<string, unknown>)?.evidenceId);
        await store.remove(id, sid);
        reply(200, { removed: true });
        return;
      }
      throw new ServiceError(
        "NOT_FOUND",
        "This operation does not exist.",
        404,
      );
    } catch (error) {
      if (error instanceof ZodError) {
        reply(400, {
          error: {
            code: "INVALID_INPUT",
            message:
              "Some inputs are invalid. Check reference types, comparison IDs, and input limits.",
          },
        });
        return;
      }
      if (error instanceof ServiceError) {
        reply(error.status, {
          error: { code: error.code, message: error.message },
        });
        return;
      }
      // Never log request bodies, provider response bodies, database URLs or credentials.
      reply(503, {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message:
            "The shared service is unavailable. Your current local decision remains available. Try again shortly.",
        },
      });
    }
  };
}
export default createHandler();
