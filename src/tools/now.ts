import { z } from "zod";
import { defineTool } from "../tool.js";

export function nowTool(clock: () => Date = () => new Date()) {
  return defineTool({
    name: "now",
    description: "Get the current date and time as an ISO 8601 UTC string.",
    input: z.object({}),
    run: () => Promise.resolve(clock().toISOString()),
  });
}
