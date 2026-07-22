import { EditorView, KeyBinding } from "@codemirror/view";
import { MathContextManager } from "../utils/context";
import { computeSnippetExpansion } from "../snippets/parse";
import { TabstopGroup } from "../snippets/tabstop";
import { addTabstopsEffect } from "../snippets/codemirror/tabstops_state_field";
import type KingsCalcLatexPlugin from "../../main";

export function createAutoFractionKeybinding(plugin: KingsCalcLatexPlugin): KeyBinding {
  return {
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
}
