import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "./agent.js";

/**
 * Adapts an Anthropic client to `MessagesClient`, opting in to server-side
 * refusal fallback (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`).
 */
export function withRefusalFallback(client: Anthropic): MessagesClient {
  return {
    async create(body, opts) {
      const message = await client.beta.messages.create(
        { ...body, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as never,
        opts,
      );
      return message as unknown as Anthropic.Message;
    },
  };
}
