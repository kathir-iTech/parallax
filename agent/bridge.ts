import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { answerSchema, referenceSchema } from "../server/schema.ts";

const origin =
  process.env.PARALLAX_URL ?? "https://parallax-culture.vercel.app";
const parsed = new URL(origin);
if (
  parsed.protocol !== "https:" &&
  !["127.0.0.1", "localhost"].includes(parsed.hostname)
)
  throw new Error("Use HTTPS for a remote PARALLAX backend.");
let session: string | null = null;
async function request(path: string, body: unknown) {
  if (!session && path !== "session") {
    const r = (await request("session", {})) as { token: string };
    session = r.token;
  }
  const response = await fetch(new URL(`/api/${path}`, origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(125000),
  });
  const data = (await response.json()) as {
    error?: { code: string; message: string };
  };
  if (!response.ok)
    throw new Error(
      `${data.error?.code ?? response.status}: ${data.error?.message ?? "The backend could not complete this action."}`,
    );
  return data;
}
const server = new McpServer({ name: "parallax", version: "1.0.0" });
server.registerTool(
  "parallax_advise",
  {
    title: "Find a place through cultural references",
    description:
      "Qloo-powered New York place-choice tool. First resolve each artist/movie and ask the person to confirm the intended identity. Prepare with 2–3 confirmed references including their proofs. Advise with the resulting evidenceId and explicit current-context answers. Present a needs-input pair without inventing an answer. A/B mean prospective willingness to try, neither vetoes both, both/skip do not imply relative preference. The tool uses a finite decision model, not an LLM or a personal enjoyment probability. Supplied answers are transmitted to the HTTPS backend for computation; they are not persisted as a server profile. No API key is required by a public tool user.",
    inputSchema: {
      action: z.enum(["resolve", "prepare", "advise", "forget"]),
      query: z.string().min(2).max(100).optional(),
      kind: z.enum(["artist", "movie"]).optional(),
      references: z.array(referenceSchema).min(2).max(3).optional(),
      evidenceId: z.string().uuid().optional(),
      answers: z.array(answerSchema).max(8).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (input) => {
    try {
      let result: unknown;
      if (input.action === "resolve") {
        if (!input.query || !input.kind)
          throw new Error("Resolve requires query and kind.");
        result = await request("resolve", {
          query: input.query,
          kind: input.kind,
        });
      } else if (input.action === "prepare") {
        if (!input.references)
          throw new Error("Prepare requires confirmed references.");
        result = await request("prepare", {
          area: "nyc",
          references: input.references,
        });
      } else if (input.action === "advise") {
        if (!input.evidenceId)
          throw new Error(
            "Advise requires an unexpired evidenceId from prepare.",
          );
        result = await request("advise", {
          evidenceId: input.evidenceId,
          answers: input.answers ?? [],
        });
      } else {
        if (!input.evidenceId) throw new Error("Forget requires evidenceId.");
        result = await request("forget", { evidenceId: input.evidenceId });
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: e instanceof Error ? e.message : "Tool operation failed.",
          },
        ],
      };
    }
  },
);
await server.connect(new StdioServerTransport());
