import { describe, expect, it, vi } from "vitest";
import { httpGetTool } from "../src/index.js";

const ctx = { signal: new AbortController().signal };

function okFetch(body: string) {
  return vi.fn(() => Promise.resolve(new Response(body, { status: 200 })));
}

describe("httpGet", () => {
  it("throws before fetching when the host is not allowlisted", async () => {
    const fetchImpl = okFetch("x");
    const tool = httpGetTool({ allowedHosts: ["example.com"], fetchImpl });

    await expect(tool.execute({ url: "https://evil.test/" }, ctx)).rejects.toThrow(/not allowed/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects non-http protocols", async () => {
    const fetchImpl = okFetch("x");
    const tool = httpGetTool({ allowedHosts: ["example.com"], fetchImpl });

    await expect(tool.execute({ url: "file://example.com/etc/passwd" }, ctx)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches allowlisted hosts and truncates the body to 20000 chars", async () => {
    const fetchImpl = okFetch("a".repeat(30_000));
    const tool = httpGetTool({ allowedHosts: ["example.com"], fetchImpl });

    const body = await tool.execute({ url: "https://example.com/data" }, ctx);

    expect(body).toHaveLength(20_000);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails on non-2xx responses", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response("no", { status: 404 })));
    const tool = httpGetTool({ allowedHosts: ["example.com"], fetchImpl });

    await expect(tool.execute({ url: "https://example.com/missing" }, ctx)).rejects.toThrow(/404/);
  });
});
