import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/index.js";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export function text(value: string): Block {
  return { type: "text", text: value };
}

export function toolUse(id: string, name: string, input: unknown): Block {
  return { type: "tool_use", id, name, input };
}

export function response(
  content: Block[],
  stopReason: Anthropic.Message["stop_reason"],
  usage = { input_tokens: 100, output_tokens: 50 },
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  } as unknown as Anthropic.Message;
}

export interface FakeClient extends MessagesClient {
  requests: Anthropic.MessageCreateParamsNonStreaming[];
}

/** Replays scripted responses; the last one repeats once the script is exhausted. */
export function fakeClient(script: Anthropic.Message[]): FakeClient {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    requests,
    create(body) {
      requests.push(structuredClone(body));
      const next = script[Math.min(requests.length - 1, script.length - 1)];
      if (!next) throw new Error("fakeClient: empty script");
      return Promise.resolve(next);
    },
  };
}

export function lastMessage(
  client: FakeClient,
  requestIndex: number,
): Anthropic.MessageParam {
  const request = client.requests[requestIndex];
  const message = request?.messages.at(-1);
  if (!message) throw new Error("fakeClient: no such request");
  return message;
}

export function lastContent(
  client: FakeClient,
  requestIndex: number,
): Anthropic.ToolResultBlockParam[] {
  const { content } = lastMessage(client, requestIndex);
  if (typeof content === "string") throw new Error("expected block content");
  return content as Anthropic.ToolResultBlockParam[];
}
