import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type KingsCalcLatexPlugin from "../main";
import { tabstopsStateField } from "./snippets/codemirror/tabstops_state_field";
import { snippetQueuePlugin } from "./snippets/codemirror/snippet_queue_state_field";
import { latexSuiteConfigField } from "./snippets/codemirror/config";
import { runSnippetsOnInput } from "./features/run_snippets";
import { createAutoFractionKeybinding } from "./features/autofraction";
import { createTaboutKeybindings } from "./features/tabout";

// ── Native obsidian-latex-suite Extension Array Coordinator ──
export function createLaTeXSuiteEngineExtension(plugin: KingsCalcLatexPlugin) {
  // If LaTeX Suite feature toggle is disabled, return empty array (100% disabled & isolated)
  if (plugin.settings.enableLaTeXSuite === false) {
    return [];
  }

  // 1. Native inputHandler (runs AFTER character is committed to document state)
  const inputHandlerExtension = EditorView.inputHandler.of((view: EditorView, from: number, to: number, text: string) => {
    if (plugin.settings.enableLaTeXSuite === false) return false;
    if (text.length !== 1) return false;
    return runSnippetsOnInput(view, text, plugin);
  });

  const autofractionKeybinding = createAutoFractionKeybinding(plugin);
  const { tabKeybinding, shiftTabKeybinding } = createTaboutKeybindings(plugin);

  return [
    latexSuiteConfigField,
    snippetQueuePlugin,
    tabstopsStateField,
    Prec.highest(inputHandlerExtension),
    Prec.highest(keymap.of([autofractionKeybinding, tabKeybinding, shiftTabKeybinding])),
  ];
}
