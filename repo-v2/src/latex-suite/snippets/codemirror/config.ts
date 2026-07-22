import { StateField } from "@codemirror/state";
import { Snippet, SnippetType } from "../snippets";

export interface LaTeXSuiteSettings {
  snippetsEnabled: boolean;
  snippets: Snippet<SnippetType>[];
  inlineMathTrigger: string;
  displayMathTrigger: string;
  autoDelete$: boolean;
  autofractionEnabled: boolean;
  autofractionSymbol: string;
  autofractionExcludedEnvs: string[];
  autofractionBreakingChars: string;
  matrixShortcutsEnabled: boolean;
  taboutEnabled: boolean;
  taboutTrigger: string;
  snippetNextTabstopTrigger: string;
  snippetPreviousTabstopTrigger: string;
  wordDelimiters: string;
  removeSnippetWhitespace: boolean;
  autoEnlargeBrackets: boolean;
  autoEnlargeBracketsTriggers: string[];
  snippetDebug: "off" | "info" | "verbose";
  suppressSnippetTriggerOnIME: boolean;
  concealEnabled: boolean;
  colorPairedBracketsEnabled: boolean;
  highlightCursorBracketsEnabled: boolean;
  mathPreviewEnabled: boolean;
  mathPreviewBracketHighlighting: boolean;
  mathPreviewPositionIsAbove: boolean;
  mathPreviewCursor: string;
}

export const DEFAULT_LATEX_SUITE_SETTINGS: LaTeXSuiteSettings = {
  snippetsEnabled: true,
  snippets: [],
  inlineMathTrigger: "mk",
  displayMathTrigger: "dm",
  autoDelete$: true,
  autofractionEnabled: true,
  autofractionSymbol: "//",
  autofractionExcludedEnvs: [],
  autofractionBreakingChars: "+-=",
  matrixShortcutsEnabled: true,
  taboutEnabled: true,
  taboutTrigger: "Tab",
  snippetNextTabstopTrigger: "Tab",
  snippetPreviousTabstopTrigger: "Shift-Tab",
  wordDelimiters: "., +-\n\t:;!?\\/{}[]()=~$'\"|`<>*^%#@&",
  removeSnippetWhitespace: true,
  autoEnlargeBrackets: true,
  autoEnlargeBracketsTriggers: ["sum", "int", "frac"],
  snippetDebug: "off",
  suppressSnippetTriggerOnIME: false,
  concealEnabled: false,
  colorPairedBracketsEnabled: true,
  highlightCursorBracketsEnabled: true,
  mathPreviewEnabled: false,
  mathPreviewBracketHighlighting: true,
  mathPreviewPositionIsAbove: true,
  mathPreviewCursor: "|",
};

export const latexSuiteConfigField = StateField.define<LaTeXSuiteSettings>({
  create() {
    return DEFAULT_LATEX_SUITE_SETTINGS;
  },
  update(value) {
    return value;
  },
});

export function getLaTeXSuiteConfig(state: any): LaTeXSuiteSettings {
  return state.field(latexSuiteConfigField, false) || DEFAULT_LATEX_SUITE_SETTINGS;
}
