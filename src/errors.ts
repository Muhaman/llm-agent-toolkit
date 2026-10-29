export class ToolInputError extends Error {
  override name = "ToolInputError";
}

export class ToolDeniedError extends Error {
  override name = "ToolDeniedError";
  constructor() {
    super("denied by user");
  }
}

export class UnknownToolError extends Error {
  override name = "UnknownToolError";
  constructor(toolName: string) {
    super(`unknown tool: ${toolName}`);
  }
}

export class CalculatorError extends Error {
  override name = "CalculatorError";
}

export class SandboxError extends Error {
  override name = "SandboxError";
}

export class TruncatedResponseError extends Error {
  override name = "TruncatedResponseError";
  constructor() {
    super("model response hit max_tokens before finishing");
  }
}
