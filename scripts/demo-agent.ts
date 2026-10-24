import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import type { Decision, Evidence, Reference } from "../core/types.ts";

// A real MCP protocol demonstration with declared sample inputs, not an LLM run.
const root = new URL("../", import.meta.url);
const url = process.env.PARALLAX_URL ?? "https://parallax-culture.vercel.app";
const client = new Client({ name: "parallax-protocol-demo", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    "--import",
    new URL("node_modules/tsx/dist/loader.mjs", root).href,
    fileURLToPath(new URL("agent/bridge.ts", root)),
  ],
  cwd: fileURLToPath(root),
  env: { PARALLAX_URL: url },
  stderr: "pipe",
});
async function call<T>(input: Record<string, unknown>): Promise<T> {
  const result = await client.callTool(
    { name: "parallax_advise", arguments: input },
    undefined,
    { timeout: 180000 },
  );
  const normalized = CallToolResultSchema.parse(result);
  const text = normalized.content.find((c) => c.type === "text");
  if (!text || text.type !== "text")
    throw new Error("Tool returned no text result.");
  if (normalized.isError) throw new Error(text.text);
  return JSON.parse(text.text) as T;
}
let evidenceId: string | undefined;
try {
  console.log("PARALLAX / actual MCP protocol demonstration");
  console.log(
    "Declared sample: Radiohead + The Grand Budapest Hotel; scripted first-option answer. No LLM is invoked.",
  );
  await client.connect(transport, { timeout: 180000 });
  assert.ok(
    (await client.listTools()).tools.some((t) => t.name === "parallax_advise"),
  );
  console.log("01  Connected to parallax_advise through MCP stdio.");
  const references: Reference[] = [];
  for (const [query, kind] of [
    ["Radiohead", "artist"],
    ["The Grand Budapest Hotel", "movie"],
  ] as const) {
    const result = await call<{ references: Reference[] }>({
      action: "resolve",
      query,
      kind,
    });
    const exact = result.references.find(
      (r) => r.name.toLowerCase() === query.toLowerCase() && r.kind === kind,
    );
    if (!exact)
      throw new Error(
        `The declared demo identity could not be confirmed: ${query}`,
      );
    references.push(exact);
  }
  console.log("02  Confirmed both declared identities using Qloo.");
  const initial = await call<{ evidence: Evidence; decision: Decision }>({
    action: "prepare",
    references,
  });
  evidenceId = initial.evidence.id;
  console.log(
    `03  Qloo ranked one shared set of ${initial.evidence.places.length} places through both cultural lenses.`,
  );
  const name = (id: string) =>
    initial.evidence.places.find((p) => p.id === id)?.name ?? id;
  const question = initial.decision.question;
  if (question) {
    console.log(
      `04  Needs a person's choice: ${name(question.a)} / ${name(question.b)}.`,
    );
    const result = await call<{ decision: Decision }>({
      action: "advise",
      evidenceId,
      answers: [
        { id: randomUUID(), a: question.a, b: question.b, choice: "a" },
      ],
    });
    assert.equal(result.decision.answered, 1);
    console.log(
      `05  Applied the declared sample answer. Leading place: ${name(result.decision.ranking[0].id)}.`,
    );
    const removed = await call<{ decision: Decision }>({
      action: "advise",
      evidenceId,
      answers: [],
    });
    assert.deepEqual(removed.decision, initial.decision);
    console.log(
      "06  Removed the answer; the initial decision was rebuilt exactly.",
    );
  } else
    console.log(
      "04  No useful comparison cleared the policy threshold; no question was invented.",
    );
  await call({ action: "forget", evidenceId });
  evidenceId = undefined;
  console.log(
    "07  Temporary evidence removed. No key or signed proof was printed.",
  );
} finally {
  if (evidenceId) await call({ action: "forget", evidenceId }).catch(() => {});
  await client.close();
}
