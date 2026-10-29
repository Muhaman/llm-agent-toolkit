import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileTool } from "../src/index.js";

const ctx = { signal: new AbortController().signal };

describe("readFile", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "agent-root-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("rejects paths that escape the root", async () => {
    const tool = readFileTool(root);

    await expect(tool.execute({ path: "../../etc/passwd" }, ctx)).rejects.toThrow("outside sandbox");
  });

  it("rejects absolute paths outside the root", async () => {
    const tool = readFileTool(root);

    await expect(tool.execute({ path: "/etc/passwd" }, ctx)).rejects.toThrow("outside sandbox");
  });

  it("rejects symlinks that point outside the root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "agent-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(join(outside, "secret.txt"), join(root, "link.txt"));
    const tool = readFileTool(root);

    await expect(tool.execute({ path: "link.txt" }, ctx)).rejects.toThrow("outside sandbox");
    await rm(outside, { recursive: true, force: true });
  });

  it("reads files inside the root", async () => {
    await writeFile(join(root, "note.txt"), "hello");
    const tool = readFileTool(root);

    expect(await tool.execute({ path: "note.txt" }, ctx)).toBe("hello");
  });
});
