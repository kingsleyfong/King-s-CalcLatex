import { Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, tooltips } from "@codemirror/view";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_SETTINGS, processLatexSuiteSettings } from "./settings/settings";
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

export function initLaTeXSuiteEngine(plugin: KingsCalcLatexPlugin): Extension[] {
  if (plugin.settings.enableLaTeXSuite === false) {
    cachedExtensions = [];
    isInitialized = true;
    return [];
  }

  try {
    const snippetVariables = (DEFAULT_SNIPPET_VARIABLES || {}) as SnippetVariables;
    const snippets = parseRawSnippetArray(DEFAULT_SNIPPETS as any[], snippetVariables);
    const CMSettings = processLatexSuiteSettings(snippets, DEFAULT_SETTINGS);

    const editorExtensions: Extension[] = [
      Prec.highest(mathBoundsPlugin.extension),
      Prec.highest(contextPlugin.extension),
      getLatexSuiteConfigExtension(CMSettings),
      Prec.highest(keyboardEventPlugin.extension),
      Prec.highest(EditorView.inputHandler.of(onInput)),
      EditorView.updateListener.of(handleUpdate),
      snippetExtensions,
    ];

    const keymaps = getKeymaps(CMSettings);
    editorExtensions.push(keymap.of(keymaps));

    if (CMSettings.concealEnabled) editorExtensions.push(mkConcealPlugin(CMSettings));
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
