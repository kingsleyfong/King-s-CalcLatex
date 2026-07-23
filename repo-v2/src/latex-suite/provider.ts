import { Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, tooltips } from "@codemirror/view";
import { Notice } from "obsidian";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_SETTINGS, processLatexSuiteSettings, LatexSuitePluginSettings } from "./settings/settings";
import { SnippetVariables, parseRawSnippetArray } from "./snippets/parse";
import DEFAULT_SNIPPETS from "./default_snippets.js";
import DEFAULT_SNIPPET_VARIABLES from "./default_snippet_variables.js";

import { getLatexSuiteConfigExtension } from "./snippets/codemirror/config";
import { handleUpdate, onInput, keyboardEventPlugin, getKeymaps } from "./latex_suite";
import { snippetExtensions } from "./snippets/codemirror/extensions";
import { mkConcealPlugin } from "./editor_extensions/conceal";
import { colorPairedBracketsPluginLowestPrec, highlightCursorBracketsPlugin } from "./editor_extensions/highlight_brackets";
import { cursorTooltipBaseTheme, cursorTooltipField } from "./editor_extensions/math_tooltip";
import { contextPlugin, mathBoundsPlugin } from "./utils/context";

let cachedExtensions: Extension[] = [];
let isInitialized = false;

/**
 * Builds the upstream `LatexSuitePluginSettings` object from KCL's own persisted
 * `plugin.settings` (KCLSettings), per the field mapping documented in `src/types.ts`
 * around the "LaTeX Suite: additional upstream settings (v3.2.1+)" section.
 *
 * NOTE: `autofractionSymbol` here is intentionally sourced from KCL's
 * `autofractionMacro` field, NOT KCL's pre-existing `autofractionSymbol` field --
 * the latter is vestigial/unused and means something different in this codebase.
 */
function buildLatexSuiteSettings(plugin: KingsCalcLatexPlugin): LatexSuitePluginSettings {
  const s = plugin.settings;

  return {
    ...DEFAULT_SETTINGS,
    // taboutTrigger intentionally left at DEFAULT_SETTINGS's value ("Tab") --
    // KCL doesn't expose the trigger key itself as a setting yet.

    // Basic settings
    taboutEnabled: s.taboutOnTab,
    autofractionEnabled: s.enableAutoFraction,
    autofractionSymbol: s.autofractionMacro,
    autofractionBreakingChars: s.autofractionBreakingChars,
    matrixShortcutsEnabled: s.enableMatrixShortcuts,
    suppressSnippetTriggerOnIME: s.suppressSnippetTriggerOnIME,
    removeSnippetWhitespace: s.removeSnippetWhitespace,
    "autoDelete$": s["autoDelete$"],
    concealEnabled: s.concealEnabled,
    concealRevealTimeout: s.concealRevealTimeout,
    colorPairedBracketsEnabled: s.colorPairedBracketsEnabled,
    highlightCursorBracketsEnabled: s.highlightCursorBracketsEnabled,
    mathPreviewEnabled: s.mathPreviewEnabled,
    mathPreviewPositionIsAbove: s.mathPreviewPositionIsAbove,
    mathPreviewCursor: s.mathPreviewCursor,
    mathPreviewBracketHighlighting: s.mathPreviewBracketHighlighting,
    taboutExitEquationOnlyOnEOL: s.taboutExitEquationOnlyOnEOL,
    autoEnlargeBrackets: s.autoEnlargeBrackets,
    autoEnlargeBracketsSpace: s.autoEnlargeBracketsSpace,
    wordDelimiters: s.wordDelimiters,
    snippetDebug: s.snippetDebug,
    // upstream stores this as a recursion depth (0 = disabled); KCL only exposes an on/off toggle.
    snippetRecursion: s.enableSnippetRecursion ? 1 : 0,

    // Raw settings -- passed through unparsed; processLatexSuiteSettings()'s valibot
    // schema / strToArray helpers parse these into their final shapes downstream.
    autofractionExcludedEnvs: s.autofractionExcludedEnvs,
    matrixShortcutsEnvNames: s.matrixShortcutsEnvNames,
    matrixShortcutsMacroNames: s.matrixShortcutsMacroNames,
    taboutClosingSymbols: s.taboutClosingSymbols,
    autoEnlargeBracketsTriggers: s.autoEnlargeBracketsTriggers,
    forceMathLanguages: s.forceMathLanguages,
  };
}

/**
 * Assembles the raw (pre-parse) snippet array from DEFAULT_SNIPPETS, the user's
 * custom snippets JSON, and the inline/display math trigger overrides, then applies
 * the enableAutoSubscript / enableRegexSnippets toggles as pre-parse filters.
 *
 * @param includeCustom Pass false to skip customSnippetsText entirely -- used as the
 * fallback path when the combined (default + custom) array fails to *parse* (as
 * opposed to failing JSON.parse/array validation, which is handled locally below).
 * A custom entry can be syntactically valid JSON and a valid array, yet still contain
 * a structurally invalid snippet object (e.g. missing `trigger`/`replacement`) that
 * only throws once parseRawSnippetArray() processes it -- see the call site in
 * initLaTeXSuiteEngine for how that case is caught and retried with includeCustom=false.
 */
function buildRawSnippets(plugin: KingsCalcLatexPlugin, includeCustom = true): any[] {
  const s = plugin.settings;
  let combined: any[] = DEFAULT_SNIPPETS as any[];

  // 1. Custom user snippets: parse plugin.settings.customSnippetsText as a JSON array
  // and concatenate onto DEFAULT_SNIPPETS. Never let a malformed custom-snippets string
  // crash the whole engine -- catch locally, notify, and fall back to defaults only.
  const customText = includeCustom ? (s.customSnippetsText ?? "").trim() : "";
  if (customText.length > 0) {
    try {
      const parsedCustom = JSON.parse(customText);
      if (!Array.isArray(parsedCustom)) {
        throw new Error("Custom LaTeX Suite snippets JSON must be an array");
      }
      combined = [...combined, ...parsedCustom];
    } catch (e) {
      console.error("King's CalcLatex: failed to parse custom LaTeX Suite snippets JSON. Falling back to default snippets only.", e);
      new Notice("King's CalcLatex: custom LaTeX Suite snippets are invalid JSON -- ignoring them. See console for details.");
      // combined remains DEFAULT_SNIPPETS, unmodified.
    }
  }

  // 2. inlineMathTrigger / displayMathTrigger: these are the literal `trigger` strings
  // on the "mk" / "dm" entries in DEFAULT_SNIPPETS (cross-checked by their unique
  // replacement text below), not standalone engine settings upstream. Only clone
  // (never mutate the shared DEFAULT_SNIPPETS module singleton) when the user has
  // actually changed a trigger away from its default.
  const inlineTrigger = s.inlineMathTrigger ?? "mk";
  const displayTrigger = s.displayMathTrigger ?? "dm";
  if (inlineTrigger !== "mk" || displayTrigger !== "dm") {
    combined = combined.map((snippet) => {
      if (snippet && typeof snippet === "object" && !Array.isArray(snippet)) {
        if (snippet.trigger === "mk" && snippet.replacement === "$$0$") {
          return { ...snippet, trigger: inlineTrigger };
        }
        if (snippet.trigger === "dm" && snippet.replacement === "$$\n\t$0\n$$") {
          return { ...snippet, trigger: displayTrigger };
        }
      }
      return snippet;
    });
  }

  // 3. enableRegexSnippets: upstream marks a snippet as regex-based via the "r" letter
  // in its `options` string (see Options.fromSource in ./snippets/options.ts) -- or by
  // giving it a literal RegExp `trigger` (e.g. the "beg"/"int" entries), which is NOT
  // covered by this filter since it has no "r" option flag to key off of. Confirmed by
  // inspection there is no separate marker for that case, so those entries are left as-is
  // when this toggle is off; only "r"-flagged entries are dropped.
  if (s.enableRegexSnippets === false) {
    combined = combined.filter((snippet) => {
      if (!snippet || typeof snippet !== "object" || Array.isArray(snippet)) return true;
      const options = typeof snippet.options === "string" ? snippet.options : "";
      return !options.includes("r");
    });
  }

  // 4. enableAutoSubscript: drop the "auto letter subscript" entries (x3 -> x_{3},
  // x_{3}4 -> x_{34}, \dot{x}3 -> \dot{x}_{3}, etc. under the "// Auto letter subscript"
  // comment in default_snippets.js). These have no `description` field to grep for, but
  // their trigger regex source is uniquely identifiable: they are the only entries in
  // DEFAULT_SNIPPETS whose trigger string contains a literal "\d" digit class (confirmed
  // via grep across the whole file -- exactly 6 matches, all under that comment block).
  if (s.enableAutoSubscript === false) {
    combined = combined.filter((snippet) => {
      if (!snippet || typeof snippet !== "object" || Array.isArray(snippet)) return true;
      return !(typeof snippet.trigger === "string" && snippet.trigger.includes("\\d"));
    });
  }

  return combined;
}

export function initLaTeXSuiteEngine(plugin: KingsCalcLatexPlugin): Extension[] {
  if (plugin.settings.enableLaTeXSuite === false) {
    cachedExtensions = [];
    isInitialized = true;
    return [];
  }

  try {
    const snippetVariables = (DEFAULT_SNIPPET_VARIABLES || {}) as SnippetVariables;
    const rawSnippets = buildRawSnippets(plugin);
    let snippets;
    try {
      snippets = parseRawSnippetArray(rawSnippets, snippetVariables);
    } catch (e) {
      // The custom snippets string can be valid JSON and a valid array, yet still
      // contain a structurally invalid snippet object (e.g. missing trigger/replacement)
      // that only throws once parsed. Don't let that escalate to the outer catch below
      // and silently zero the whole engine -- notify and retry with defaults only.
      console.error("King's CalcLatex: one or more custom LaTeX Suite snippets are structurally invalid. Falling back to default snippets only.", e);
      new Notice("King's CalcLatex: a custom LaTeX Suite snippet is invalid -- falling back to built-in snippets only. See console for details.");
      const fallbackRawSnippets = buildRawSnippets(plugin, /* includeCustom */ false);
      snippets = parseRawSnippetArray(fallbackRawSnippets, snippetVariables);
    }
    const latexSuiteSettings = buildLatexSuiteSettings(plugin);
    const CMSettings = processLatexSuiteSettings(snippets, latexSuiteSettings);

    const editorExtensions: Extension[] = [
      Prec.highest(mathBoundsPlugin),
      Prec.highest(contextPlugin),
      getLatexSuiteConfigExtension(CMSettings),
      Prec.highest(keyboardEventPlugin),
      Prec.highest(EditorView.inputHandler.of(onInput)),
      EditorView.updateListener.of(handleUpdate),
      snippetExtensions,
    ];

    const keymaps = getKeymaps(CMSettings);
    editorExtensions.push(keymap.of(keymaps));

    if (CMSettings.concealEnabled) editorExtensions.push(mkConcealPlugin(CMSettings.concealRevealTimeout));
    if (CMSettings.colorPairedBracketsEnabled) editorExtensions.push(colorPairedBracketsPluginLowestPrec);
    if (CMSettings.highlightCursorBracketsEnabled) editorExtensions.push(highlightCursorBracketsPlugin.extension);
    if (CMSettings.mathPreviewEnabled) editorExtensions.push([cursorTooltipField.extension, cursorTooltipBaseTheme, tooltips({ position: "absolute" })]);

    cachedExtensions = editorExtensions;
    isInitialized = true;
    return editorExtensions;
  } catch (e) {
    console.error("Failed to initialize verbatim LaTeX Suite extension array:", e);
    cachedExtensions = [];
    isInitialized = true;
    return [];
  }
}

export function getLaTeXSuiteEngineExtension(plugin: KingsCalcLatexPlugin): Extension[] {
  if (!isInitialized) {
    initLaTeXSuiteEngine(plugin);
  }
  return cachedExtensions;
}
