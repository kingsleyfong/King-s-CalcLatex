import { EditorView, KeyBinding } from "@codemirror/view";
import { tabstopsStateField } from "../snippets/codemirror/tabstops_state_field";
import type KingsCalcLatexPlugin from "../../main";

export function createTaboutKeybindings(plugin: KingsCalcLatexPlugin): { tabKeybinding: KeyBinding; shiftTabKeybinding: KeyBinding } {
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

  return { tabKeybinding, shiftTabKeybinding };
}
