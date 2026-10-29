import { z } from "zod";
import { defineTool } from "../tool.js";

const TIMEOUT_MS = 5_000;
const MAX_CHARS = 20_000;

export interface HttpGetOptions {
  allowedHosts: string[];
  fetchImpl?: typeof fetch;
}

export function httpGetTool({ allowedHosts, fetchImpl = fetch }: HttpGetOptions) {
  const allowed = new Set(allowedHosts.map((h) => h.toLowerCase()));
  return defineTool({
    name: "http_get",
    description: `Fetch a URL with HTTP GET and return the body (truncated to ${MAX_CHARS} characters). Allowed hosts: ${allowedHosts.join(", ") || "none"}.`,
    input: z.object({ url: z.string().describe("absolute http(s) URL") }),
    async run({ url }, { signal }) {
      const target = new URL(url);
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        throw new Error(`unsupported protocol: ${target.protocol}`);
      }
      if (!allowed.has(target.hostname.toLowerCase())) {
        throw new Error(`host not allowed: ${target.hostname}`);
      }
      const res = await fetchImpl(target, {
        // Redirects could leave the allowlist, so they are surfaced as non-2xx instead of followed.
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.text()).slice(0, MAX_CHARS);
    },
  });
}
