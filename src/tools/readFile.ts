import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { SandboxError } from "../errors.js";
import { defineTool } from "../tool.js";

const MAX_CHARS = 20_000;

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function readFileTool(rootDir: string) {
  const root = resolve(rootDir);
  return defineTool({
    name: "read_file",
    description: `Read a UTF-8 text file under the sandbox root (truncated to ${MAX_CHARS} characters).`,
    input: z.object({ path: z.string().describe("path relative to the sandbox root") }),
    async run({ path }) {
      const target = resolve(root, path);
      if (!isInside(root, target)) throw new SandboxError("path is outside sandbox");
      // Resolve symlinks so a link inside the root cannot point out of it.
      const real = await realpath(target);
      if (!isInside(await realpath(root), real)) throw new SandboxError("path is outside sandbox");
      return (await readFile(real, "utf8")).slice(0, MAX_CHARS);
    },
  });
}
