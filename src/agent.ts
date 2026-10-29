import type Anthropic from "@anthropic-ai/sdk";
import { ToolDeniedError, TruncatedResponseError, UnknownToolError } from "./errors.js";
import type { Tool } from "./tool.js";
import { addUsage, emptyUsage, type Usage } from "./usage.js";

export type MessagesClient = {
  create(
    body: Anthropic.MessageCreateParamsNonStreaming,
    opts?: { signal?: AbortSignal },
  ): Promise<Anthropic.Message>;
};

export type StopReason = "end_turn" | "max_iterations" | "budget" | "refusal";

export interface AgentResult {
  text: string;
  iterations: number;
  stopReason: StopReason;
  usage: Usage;
}

export type AgentEvent =
  | { type: "llm_request"; iteration: number }
  | { type: "llm_response"; iteration: number; stopReason: string | null; usage: Usage }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; name: string; isError: boolean };

export interface AgentOptions {
  client: MessagesClient;
  model?: string;
  system?: string;
  tools: Tool[];
  maxIterations?: number;
  /** Total output-token budget across all turns. */
  maxOutputTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  approve?: (call: { name: string; input: unknown }) => Promise<boolean>;
  onEvent?: (event: AgentEvent) => void;
}

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOKENS_PER_REQUEST = 16_000;

export class Agent {
  private readonly tools: Map<string, Tool>;
  private readonly maxIterations: number;
  private readonly maxOutputTokens: number;
  private readonly model: string;

  constructor(private readonly options: AgentOptions) {
    this.tools = new Map(options.tools.map((tool) => [tool.name, tool]));
    this.maxIterations = options.maxIterations ?? 10;
    this.maxOutputTokens = options.maxOutputTokens ?? 50_000;
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async run(prompt: string, signal?: AbortSignal): Promise<AgentResult> {
    const { client, system, onEvent } = this.options;
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
    const usage = emptyUsage();
    const ctx = { signal: signal ?? new AbortController().signal };
    const finish = (stopReason: StopReason, iterations: number, text: string): AgentResult => ({
      text,
      iterations,
      stopReason,
      usage,
    });

    for (let iteration = 1; ; iteration++) {
      signal?.throwIfAborted();
      onEvent?.({ type: "llm_request", iteration });
      const response = await client.create(
        {
          model: this.model,
          max_tokens: Math.min(MAX_TOKENS_PER_REQUEST, this.maxOutputTokens - usage.outputTokens),
          ...(system ? { system } : {}),
          tools: this.options.tools.map((tool) => tool.definition),
          messages,
          thinking: { type: "adaptive" },
          output_config: { effort: this.options.effort ?? "high" },
        },
        { signal },
      );
      addUsage(usage, this.model, response.usage);
      onEvent?.({
        type: "llm_response",
        iteration,
        stopReason: response.stop_reason,
        usage: { ...usage },
      });

      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");
      const overBudget = usage.outputTokens >= this.maxOutputTokens;

      if (response.stop_reason === "refusal") return finish("refusal", iteration, text);
      if (response.stop_reason === "max_tokens") {
        if (overBudget) return finish("budget", iteration, text);
        throw new TruncatedResponseError();
      }
      if (response.stop_reason !== "tool_use") return finish("end_turn", iteration, text);
      if (overBudget) return finish("budget", iteration, text);
      if (iteration >= this.maxIterations) return finish("max_iterations", iteration, text);

      messages.push({ role: "assistant", content: response.content });
      const calls = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      const results = await Promise.all(calls.map((call) => this.runTool(call, ctx)));
      messages.push({ role: "user", content: results });
    }
  }

  private async runTool(
    call: Anthropic.ToolUseBlock,
    ctx: { signal: AbortSignal },
  ): Promise<Anthropic.ToolResultBlockParam> {
    const { onEvent, approve } = this.options;
    onEvent?.({ type: "tool_start", id: call.id, name: call.name, input: call.input });
    let content: string;
    let isError = false;
    try {
      const tool = this.tools.get(call.name);
      if (!tool) throw new UnknownToolError(call.name);
      if (tool.dangerous && !(await approve?.({ name: call.name, input: call.input }))) {
        throw new ToolDeniedError();
      }
      content = await tool.execute(call.input, ctx);
    } catch (error) {
      isError = true;
      content = error instanceof Error ? error.message : String(error);
    }
    onEvent?.({ type: "tool_end", id: call.id, name: call.name, isError });
    return {
      type: "tool_result",
      tool_use_id: call.id,
      content,
      ...(isError ? { is_error: true } : {}),
    };
  }
}
