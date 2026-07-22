import { EditorView, KeyBinding, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type KingsCalcLatexPlugin from "../main";
import { MathContextManager } from "./utils/context";
import { TabstopGroup } from "./snippets/tabstop";
import { tabstopsStateField, addTabstopsEffect } from "./snippets/codemirror/tabstops_state_field";
import { snippetQueuePlugin } from "./snippets/codemirror/snippet_queue_state_field";
import { computeSnippetExpansion } from "./snippets/parse";
import { runSnippetsOnInput } from "./features/run_snippets";

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

  // 2. Auto-fraction keybinding for "/"
  const autofractionKeybinding: KeyBinding = {
    key: "/",
    run: (view: EditorView) => {
      if (plugin.settings.enableLaTeXSuite === false || plugin.settings.enableAutoFraction === false) return false;
      const state = view.state;
      const mainSel = state.selection.main;
      const pos = mainSel.head;
      const inMath = MathContextManager.isMathMode(state, pos);
      if (!inMath) return false;

      // Handle visual selection on "/"
      if (!mainSel.empty) {
        const selectedText = state.sliceDoc(mainSel.from, mainSel.to);
        const { text: replacementText, initialCursorOffset, tabstopGroups } = computeSnippetExpansion(`\\frac{${selectedText}}{$0}`);
        const targetCursorPos = mainSel.from + initialCursorOffset;

        const mappedTabstops = tabstopGroups.map((grp) => {
          return new TabstopGroup(
            grp.index,
            grp.ranges.map((r) => ({
              from: mainSel.from + r.from,
              to: mainSel.from + r.to,
            })),
          );
        });

        view.dispatch({
          changes: { from: mainSel.from, to: mainSel.to, insert: replacementText },
          selection: { anchor: targetCursorPos, head: targetCursorPos },
          effects: [addTabstopsEffect.of(mappedTabstops)],
          userEvent: "input.type",
          scrollIntoView: true,
        });

        return true;
      }

      // Handle normal "/" fraction numerator scanning
      const line = state.doc.lineAt(pos);
      const lineText = line.text;
      const col = pos - line.from;

      if (col === 0) return false;

      let startCol = col;
      let depth = 0;
      for (let i = col - 1; i >= 0; i--) {
        const ch = lineText[i];
        if (ch === "}" || ch === ")" || ch === "]") {
          depth++;
        } else if (ch === "{" || ch === "(" || ch === "[") {
          depth--;
          if (depth < 0) {
            startCol = i + 1;
            break;
          }
        } else if (depth === 0 && (ch === " " || ch === "+" || ch === "-" || ch === "=" || ch === "$" || ch === "\t")) {
          startCol = i + 1;
          break;
        } else if (i === 0) {
          startCol = 0;
        }
      }

      if (startCol >= col) return false;

      const numerator = lineText.slice(startCol, col);
      const replaceFrom = line.from + startCol;
      const replaceTo = pos;

      const { text: replacementText, initialCursorOffset, tabstopGroups } = computeSnippetExpansion(`\\frac{${numerator}}{$0}`);
      const targetCursorPos = replaceFrom + initialCursorOffset;

      const mappedTabstops = tabstopGroups.map((grp) => {
        return new TabstopGroup(
          grp.index,
          grp.ranges.map((r) => ({
            from: replaceFrom + r.from,
            to: replaceFrom + r.to,
          })),
        );
      });

      view.dispatch({
        changes: { from: replaceFrom, to: replaceTo, insert: replacementText },
        selection: { anchor: targetCursorPos, head: targetCursorPos },
        effects: [addTabstopsEffect.of(mappedTabstops)],
        userEvent: "input.type",
        scrollIntoView: true,
      });

      return true;
    },
  };

  // 3. Tab & Shift-Tab Keybindings (Prec.highest to override default indent)
  const tabKeybinding: KeyBinding = {
    key: "Tab",
    run: (view: EditorView) => {
      if (plugin.settings.enableLaTeXSuite === false) return false;
      const state = view.state;
      const tsState = state.field(tabstopsStateField, false);

      // Jump through active tabstops if present
      if (tsState && tsState.tabstopGroups.length > 0) {
        const groups = tsState.tabstopGroups;
        const currentPos = state.selection.main.head;

        for (let i = 0; i < groups.length; i++) {
          const grp = groups[i];
          if (grp.ranges.length > 0) {
            const range = grp.ranges[0];
            if (range.from > currentPos || (range.from === currentPos && grp.index !== 0)) {
              view.dispatch({
                selection: { anchor: range.from, head: range.to },
                scrollIntoView: true,
              });
              return true;
            }
          }
        }
      }

      // Tabout of delimiters
      if (plugin.settings.taboutOnTab) {
        const mainSel = view.state.selection.main;
        if (!mainSel.empty) return false;
        const pos = mainSel.head;
        const docStr = view.state.doc.toString();

        const charAfter = docStr.slice(pos, pos + 2);
        if (charAfter.startsWith("}") || charAfter.startsWith("]") || charAfter.startsWith(")")) {
          view.dispatch({ selection: { anchor: pos + 1, head: pos + 1 }, scrollIntoView: true });
          return true;
        }
        if (charAfter.startsWith("$$")) {
          view.dispatch({ selection: { anchor: pos + 2, head: pos + 2 }, scrollIntoView: true });
          return true;
        }
        if (charAfter.startsWith("$")) {
          view.dispatch({ selection: { anchor: pos + 1, head: pos + 1 }, scrollIntoView: true });
          return true;
        }

        for (let offset = 1; offset < 80 && pos + offset <= docStr.length; offset++) {
          const ch = docStr[pos + offset - 1];
          if (ch === "}" || ch === "]" || ch === ")" || ch === "$") {
            view.dispatch({ selection: { anchor: pos + offset, head: pos + offset }, scrollIntoView: true });
            return true;
          }
        }
      }

      return false;
    },
  };

  const shiftTabKeybinding: KeyBinding = {
    key: "Shift-Tab",
    run: (view: EditorView) => {
      if (plugin.settings.enableLaTeXSuite === false) return false;
      const state = view.state;
      const tsState = state.field(tabstopsStateField, false);

      if (tsState && tsState.tabstopGroups.length > 0) {
        const groups = tsState.tabstopGroups;
        const currentPos = state.selection.main.head;

        for (let i = groups.length - 1; i >= 0; i--) {
          const grp = groups[i];
          if (grp.ranges.length > 0) {
            const range = grp.ranges[0];
            if (range.from < currentPos) {
              view.dispatch({
                selection: { anchor: range.from, head: range.to },
                scrollIntoView: true,
              });
              return true;
            }
          }
        }
      }

      if (plugin.settings.taboutOnTab) {
        const mainSel = view.state.selection.main;
        if (!mainSel.empty) return false;
        const pos = mainSel.head;
        const docStr = view.state.doc.toString();

        for (let offset = 1; offset < 80 && pos - offset >= 0; offset--) {
          const ch = docStr[pos - offset];
          if (ch === "{" || ch === "[" || ch === "(" || ch === "$") {
            view.dispatch({ selection: { anchor: pos - offset, head: pos - offset }, scrollIntoView: true });
            return true;
          }
        }
      }

      return false;
    },
  };

  return [
    snippetQueuePlugin,
    tabstopsStateField,
    Prec.highest(inputHandlerExtension),
    Prec.highest(keymap.of([autofractionKeybinding, tabKeybinding, shiftTabKeybinding])),
  ];
}
