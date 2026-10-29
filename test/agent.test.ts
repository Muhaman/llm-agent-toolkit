import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Agent, calculatorTool, defineTool } from "../src/index.js";
import {
  fakeClient,
  lastContent,
  lastMessage,
  response,
  text,
  toolUse,
} from "./fakeClient.js";

describe("Agent", () => {
  it("round-trips a tool call and returns the final text", async () => {
    const client = fakeClient([
      response([toolUse("t1", "calculator", { expression: "2+3*4" })], "tool_use"),
      response([text("14")], "end_turn"),
    ]);
    const result = await new Agent({ client, tools: [calculatorTool] }).run("2+3*4?");

    expect(result.text).toBe("14");
    expect(result.iterations).toBe(2);
    expect(result.stopReason).toBe("end_turn");
    const [block] = lastContent(client, 1);
    expect(block).toMatchObject({ type: "tool_result", tool_use_id: "t1", content: "14" });
  });

  it("returns parallel tool results in a single user message", async () => {
    const client = fakeClient([
      response(
        [
          toolUse("a", "calculator", { expression: "1+1" }),
          toolUse("b", "calculator", { expression: "2*3" }),
        ],
        "tool_use",
      ),
      response([text("done")], "end_turn"),
    ]);
    await new Agent({ client, tools: [calculatorTool] }).run("go");

    const last = lastMessage(client, 1);
    expect(last.role).toBe("user");
    const results = lastContent(client, 1);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.content)).toEqual(["2", "6"]);
  });

  it("appends the full assistant content to history", async () => {
    const client = fakeClient([
      response([text("thinking out loud"), toolUse("t1", "calculator", { expression: "1" })], "tool_use"),
      response([text("ok")], "end_turn"),
    ]);
    await new Agent({ client, tools: [calculatorTool] }).run("go");

    const assistant = client.requests[1]?.messages.at(-2);
    expect(assistant?.role).toBe("assistant");
    expect(assistant?.content).toHaveLength(2);
  });

  it("reports a thrown tool error as is_error and continues", async () => {
    const boom = defineTool({
      name: "boom",
      description: "always fails",
      input: z.object({}),
      run: () => Promise.reject(new Error("kaput")),
    });
    const client = fakeClient([
      response([toolUse("t1", "boom", {})], "tool_use"),
      response([text("recovered")], "end_turn"),
    ]);
    const result = await new Agent({ client, tools: [boom] }).run("go");

    expect(result.stopReason).toBe("end_turn");
    expect(lastContent(client, 1)[0]).toMatchObject({ is_error: true, content: "kaput" });
  });

  it("reports zod-invalid input as is_error with the validation message", async () => {
    const client = fakeClient([
      response([toolUse("t1", "calculator", { expression: 42 })], "tool_use"),
      response([text("sorry")], "end_turn"),
    ]);
    await new Agent({ client, tools: [calculatorTool] }).run("go");

    const [block] = lastContent(client, 1);
    expect(block?.is_error).toBe(true);
    expect(String(block?.content)).toContain("expression");
  });

  it("reports an unknown tool as is_error", async () => {
    const client = fakeClient([
      response([toolUse("t1", "nope", {})], "tool_use"),
      response([text("ok")], "end_turn"),
    ]);
    await new Agent({ client, tools: [calculatorTool] }).run("go");

    expect(lastContent(client, 1)[0]).toMatchObject({ is_error: true });
  });

  it("stops at maxIterations", async () => {
    const client = fakeClient([
      response([toolUse("t1", "calculator", { expression: "1" })], "tool_use"),
    ]);
    const result = await new Agent({ client, tools: [calculatorTool], maxIterations: 3 }).run("loop");

    expect(result.stopReason).toBe("max_iterations");
    expect(client.requests).toHaveLength(3);
  });

  it("stops when the output token budget is spent", async () => {
    const client = fakeClient([
      response([toolUse("t1", "calculator", { expression: "1" })], "tool_use", {
        input_tokens: 10,
        output_tokens: 600,
      }),
    ]);
    const result = await new Agent({ client, tools: [calculatorTool], maxOutputTokens: 1000 }).run("loop");

    expect(result.stopReason).toBe("budget");
    expect(client.requests).toHaveLength(2);
    expect(result.usage.outputTokens).toBe(1200);
  });

  it("denies a dangerous tool when approval is refused", async () => {
    const run = vi.fn(() => Promise.resolve("deleted"));
    const rm = defineTool({
      name: "rm",
      description: "dangerous",
      input: z.object({ path: z.string() }),
      dangerous: true,
      run,
    });
    const approve = vi.fn(() => Promise.resolve(false));
    const client = fakeClient([
      response([toolUse("t1", "rm", { path: "/x" })], "tool_use"),
      response([text("ok")], "end_turn"),
    ]);
    await new Agent({ client, tools: [rm], approve }).run("go");

    expect(approve).toHaveBeenCalledWith({ name: "rm", input: { path: "/x" } });
    expect(run).not.toHaveBeenCalled();
    expect(lastContent(client, 1)[0]).toMatchObject({ is_error: true, content: "denied by user" });
  });

  it("runs a dangerous tool when approved", async () => {
    const rm = defineTool({
      name: "rm",
      description: "dangerous",
      input: z.object({ path: z.string() }),
      dangerous: true,
      run: () => Promise.resolve("deleted"),
    });
    const client = fakeClient([
      response([toolUse("t1", "rm", { path: "/x" })], "tool_use"),
      response([text("ok")], "end_turn"),
    ]);
    await new Agent({ client, tools: [rm], approve: () => Promise.resolve(true) }).run("go");

    expect(lastContent(client, 1)[0]).toMatchObject({ content: "deleted" });
  });

  it("surfaces a refusal", async () => {
    const client = fakeClient([response([], "refusal")]);
    const result = await new Agent({ client, tools: [] }).run("go");

    expect(result.stopReason).toBe("refusal");
  });

  it("throws on a truncated response", async () => {
    const client = fakeClient([response([text("partial")], "max_tokens")]);

    await expect(new Agent({ client, tools: [] }).run("go")).rejects.toThrow(/max_tokens/);
  });

  it("sums usage across turns and prices it at opus-5-5 rates", async () => {
    const client = fakeClient([
      response([toolUse("t1", "calculator", { expression: "1" })], "tool_use", {
        input_tokens: 1_000_000,
        output_tokens: 100_000,
      }),
      response([text("done")], "end_turn", { input_tokens: 500_000, output_tokens: 50_000 }),
    ]);
    const result = await new Agent({ client, tools: [calculatorTool], maxOutputTokens: 1_000_000 }).run("go");

    expect(result.usage.inputTokens).toBe(1_500_000);
    expect(result.usage.outputTokens).toBe(150_000);
    expect(result.usage.costUsd).toBeCloseTo(1.5 * 4 + 0.15 * 20, 6);
  });

  it("emits lifecycle events", async () => {
    const events: string[] = [];
    const client = fakeClient([
      response([toolUse("t1", "calculator", { expression: "1" })], "tool_use"),
      response([text("ok")], "end_turn"),
    ]);
    await new Agent({ client, tools: [calculatorTool], onEvent: (e) => events.push(e.type) }).run("go");

    expect(events).toEqual([
      "llm_request",
      "llm_response",
      "tool_start",
      "tool_end",
      "llm_request",
      "llm_response",
    ]);
  });
});
