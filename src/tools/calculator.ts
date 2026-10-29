import { z } from "zod";
import { CalculatorError } from "../errors.js";
import { defineTool } from "../tool.js";

type Token = { kind: "num"; value: number } | { kind: "op"; value: string };

const NUMBER = /^(?:\d+\.?\d*|\.\d+)/;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let rest = source.trimStart();
  while (rest.length > 0) {
    const num = NUMBER.exec(rest);
    if (num) {
      tokens.push({ kind: "num", value: Number(num[0]) });
      rest = rest.slice(num[0].length);
    } else if ("+-*/^()".includes(rest[0] ?? "")) {
      tokens.push({ kind: "op", value: rest[0] as string });
      rest = rest.slice(1);
    } else {
      throw new CalculatorError(`unexpected character: ${rest[0]}`);
    }
    rest = rest.trimStart();
  }
  return tokens;
}

/**
 * Grammar (lowest to highest precedence):
 *   expr   = term (("+" | "-") term)*
 *   term   = unary (("*" | "/") unary)*
 *   unary  = "-" unary | power
 *   power  = primary ("^" unary)?        right-associative; -2^2 = -4
 *   primary = number | "(" expr ")"
 */
class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.expr();
    if (this.pos < this.tokens.length) throw new CalculatorError("unexpected trailing input");
    return value;
  }

  private peekOp(): string | undefined {
    const token = this.tokens[this.pos];
    return token?.kind === "op" ? token.value : undefined;
  }

  private expr(): number {
    let left = this.term();
    for (let op = this.peekOp(); op === "+" || op === "-"; op = this.peekOp()) {
      this.pos++;
      const right = this.term();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private term(): number {
    let left = this.unary();
    for (let op = this.peekOp(); op === "*" || op === "/"; op = this.peekOp()) {
      this.pos++;
      const right = this.unary();
      if (op === "/" && right === 0) throw new CalculatorError("division by zero");
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  private unary(): number {
    if (this.peekOp() === "-") {
      this.pos++;
      return -this.unary();
    }
    return this.power();
  }

  private power(): number {
    const base = this.primary();
    if (this.peekOp() === "^") {
      this.pos++;
      return base ** this.unary();
    }
    return base;
  }

  private primary(): number {
    const token = this.tokens[this.pos++];
    if (!token) throw new CalculatorError("unexpected end of expression");
    if (token.kind === "num") return token.value;
    if (token.value !== "(") throw new CalculatorError(`unexpected token: ${token.value}`);
    const value = this.expr();
    const close = this.tokens[this.pos++];
    if (close?.kind !== "op" || close.value !== ")") throw new CalculatorError("missing closing parenthesis");
    return value;
  }
}

export function calculate(expr: string): number {
  const result = new Parser(tokenize(expr)).parse();
  if (!Number.isFinite(result)) throw new CalculatorError("result is not a finite number");
  return result;
}

export const calculatorTool = defineTool({
  name: "calculator",
  description:
    "Evaluate an arithmetic expression. Supports + - * / ^ (right-associative), parentheses, decimals and unary minus.",
  input: z.object({ expression: z.string().describe('e.g. "2+3*4"') }),
  run: ({ expression }) => Promise.resolve(String(calculate(expression))),
});
