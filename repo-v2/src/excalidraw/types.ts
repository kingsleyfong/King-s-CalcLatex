/**
 * Shared types for the Excalidraw companion's own lightweight snippet engine
 * (distinct from the CM6-based src/latex-suite/** engine used in Markdown notes --
 * Excalidraw's text-editing textareas are plain <textarea> elements, not CodeMirror).
 */

/** Current math context at the cursor, as determined by scanning $ / $$ delimiters. */
export type MathMode = "text" | "math" | "display";

export interface SnippetFlags {
  math: boolean;
  text: boolean;
  display: boolean;
  auto: boolean;
  regex: boolean;
  word: boolean;
  visual: boolean;
}

export interface SnippetDef {
  trigger: string | RegExp;
  replacement: string | ((match: RegExpExecArray) => string);
  options: string;
  description?: string;
  priority?: number;
  flags: SnippetFlags;
}
