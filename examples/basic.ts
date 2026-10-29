import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Agent, calculatorTool, defineTool, withRefusalFallback } from "../src/index.js";

const shout = defineTool({
  name: "shout",
  description: "Upper-case a string.",
  input: z.object({ value: z.string() }),
  run: ({ value }) => Promise.resolve(value.toUpperCase()),
});

const agent = new Agent({
  client: withRefusalFallback(new Anthropic()),
  system: "Use tools for arithmetic and string transforms.",
  tools: [calculatorTool, shout],
  onEvent: (event) => {
    if (event.type === "tool_start") process.stdout.write(`tool: ${event.name}\n`);
  },
});

const result = await agent.run("What is (17 + 5) * 3, and shout the word 'done'?");
process.stdout.write(`${result.text}\n${JSON.stringify(result.usage)}\n`);
