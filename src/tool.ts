import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ToolInputError } from "./errors.js";

export interface ToolContext {
  signal: AbortSignal;
}

export interface Tool {
  readonly name: string;
  readonly dangerous: boolean;
  /** Wire definition sent to the API. */
  readonly definition: Anthropic.Tool;
  /** Validates raw model input against the zod schema, then runs the tool. */
  execute(input: unknown, ctx: ToolContext): Promise<string>;
}

export interface ToolDefinition<S extends z.ZodType> {
  name: string;
  description: string;
  input: S;
  dangerous?: boolean;
  run(input: z.infer<S>, ctx: ToolContext): Promise<string>;
}

export function defineTool<S extends z.ZodType>(def: ToolDefinition<S>): Tool {
  const schema = z.toJSONSchema(def.input) as Record<string, unknown>;
  delete schema["$schema"];
  return {
    name: def.name,
    dangerous: def.dangerous ?? false,
    definition: {
      name: def.name,
      description: def.description,
      input_schema: schema as Anthropic.Tool["input_schema"],
      strict: true,
    },
    async execute(input, ctx) {
      const parsed = def.input.safeParse(input);
      if (!parsed.success) throw new ToolInputError(z.prettifyError(parsed.error));
      return def.run(parsed.data, ctx);
    },
  };
}
