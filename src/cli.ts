#!/usr/bin/env node
import Anthropic from "@anthropic-ai/sdk";
import {
  Agent,
  calculatorTool,
  httpGetTool,
  nowTool,
  readFileTool,
  withRefusalFallback,
} from "./index.js";

async function main(): Promise<number> {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    process.stderr.write('usage: agent "<question>"\n');
    return 2;
  }
  if (!process.env["ANTHROPIC_API_KEY"]) {
    process.stderr.write("ANTHROPIC_API_KEY is required\n");
    return 2;
  }

  const allowedHosts = (process.env["AGENT_ALLOWED_HOSTS"] ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const agent = new Agent({
    client: withRefusalFallback(new Anthropic()),
    model: process.env["ANTHROPIC_MODEL"] ?? "claude-opus-5-5",
    tools: [
      calculatorTool,
      httpGetTool({ allowedHosts }),
      readFileTool(process.env["AGENT_ROOT_DIR"] ?? process.cwd()),
      nowTool(),
    ],
  });

  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());
  const result = await agent.run(question, abort.signal);

  process.stdout.write(`${result.text}\n`);
  const { inputTokens, outputTokens, costUsd } = result.usage;
  process.stdout.write(
    `\n[${result.stopReason}] iterations=${result.iterations} input=${inputTokens} output=${outputTokens} cost=$${costUsd.toFixed(4)}\n`,
  );
  return result.stopReason === "end_turn" ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
