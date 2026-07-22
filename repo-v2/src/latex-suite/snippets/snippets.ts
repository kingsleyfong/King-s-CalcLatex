import { BaseNode, ArrayNode, SnippetTabstopOnlyNode } from "./luasnip_api/node";

export const VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER = "${VISUAL}";

export type SnippetType = "visual" | "regex" | "string";

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
    public rawReplacement: string = "",
  ) {}
}
