export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** USD per million tokens (input, output). */
const PRICING: Record<string, readonly [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
const DEFAULT_PRICE = PRICING["claude-opus-5-5"] ?? [4, 20];

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

export function addUsage(
  total: Usage,
  model: string,
  tokens: { input_tokens: number; output_tokens: number },
): void {
  const [inputRate, outputRate] = PRICING[model] ?? DEFAULT_PRICE;
  total.inputTokens += tokens.input_tokens;
  total.outputTokens += tokens.output_tokens;
  total.costUsd +=
    (tokens.input_tokens * inputRate + tokens.output_tokens * outputRate) / 1_000_000;
}
