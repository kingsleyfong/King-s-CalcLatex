import { BaseNode, ArrayNode, SnippetTabstopOnlyNode } from "./luasnip_api/node";
import * as v from "valibot";

export const VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER = "${VISUAL}";

export type SnippetType = "visual" | "regex" | "string";

const ReplacementOutputSchema = v.union([
  v.literal(false),
  v.string(),
  v.array(v.instance(BaseNode)),
]);

function convertOutputToNode(rawReplacement: unknown): ArrayNode | null {
  const parseResult = v.safeParse(ReplacementOutputSchema, rawReplacement);
  if (!parseResult.success) {
    console.error("Invalid replacement output:", parseResult.issues);
    return null;
  }
  if (parseResult.output === false) {
    return null;
  } else if (typeof parseResult.output === "string") {
    const snippet = new SnippetTabstopOnlyNode(parseResult.output);
    return new ArrayNode([snippet]);
  } else if (Array.isArray(parseResult.output)) {
    return new ArrayNode(parseResult.output);
  }
  return null;
}

export type SnippetData<T extends SnippetType> = {
  visual: {
    trigger: string;
    replacement: ArrayNode | ((selection: string) => unknown);
  };
  regex: {
    trigger: RegExp;
    replacement: ArrayNode | ((match: RegExpExecArray) => unknown);
    triggerAfter?: RegExp;
  };
  string: {
    trigger: string;
    replacement: ArrayNode | ((match: string) => unknown);
  };
}[T];

export class Snippet<T extends SnippetType> {
  constructor(
    public type: T,
    public data: SnippetData<T>,
    public options: string = "mA",
    public description: string = "",
    public priority: number = 0,
  ) {}
}
