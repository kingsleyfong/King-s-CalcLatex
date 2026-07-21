import { EditorView, KeyBinding, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_LATEX_SUITE_SNIPPETS } from "../snippets/default-snippets";
import { MathContextManager } from "./utils/context";
import { parseRawSnippets } from "./snippets/parse";
import { SnippetTabstopOnlyNode, emptyInsertOptions } from "./snippets/luasnip_api/node";
import { tabstopSpecsToTabstopGroups, TabstopGroup } from "./snippets/tabstop";

export function createLaTeXSuiteEngineExtension(plugin: KingsCalcLatexPlugin) {
  const parsedDefaultSnippets = parseRawSnippets(DEFAULT_LATEX_SUITE_SNIPPETS);

  const keydownExtension = Prec.highest(
    EditorView.domEventHandlers({
      keydown(event: KeyboardEvent, view: EditorView) {
        if (!plugin.settings.enableLaTeXSuite) return false;
        if (event.ctrlKey || event.altKey || event.metaKey) return false;
        if (event.key.length !== 1) return false;

        const state = view.state;
        const mainSel = state.selection.main;
        if (!mainSel.empty) return false;

        const pos = mainSel.head;
        const line = state.doc.lineAt(pos);
        const lineText = line.text;
        const col = pos - line.from;

        const charTyped = event.key;
        const textBefore = lineText.slice(0, col) + charTyped;
        const inMath = MathContextManager.isMathMode(state, pos);

        // 1. Auto-subscript digits (e.g. x1 -> x_1, a2 -> a_2)
        if (plugin.settings.enableAutoSubscript && inMath && /\d/.test(charTyped)) {
          const prevChar = lineText.slice(col - 1, col);
          if (/[a-zA-Z]/.test(prevChar)) {
            const replaceFrom = pos - 1;
            const insertText = `${prevChar}_${charTyped}`;

            view.dispatch({
              changes: { from: replaceFrom, to: pos, insert: insertText },
              selection: { anchor: replaceFrom + insertText.length, head: replaceFrom + insertText.length },
            });
            event.preventDefault();
            return true;
          }
        }

        // 2. Custom & Default Snippets
        for (const s of parsedDefaultSnippets) {
          const opts = s.options || "";
          const isMathOnly = opts.includes("m");
          const isTextOnly = opts.includes("t");
          const autoExpand = opts.includes("A");

          if (!autoExpand) continue;
          if (isMathOnly && !inMath) continue;
          if (isTextOnly && inMath) continue;

          let trigger = typeof s.data.trigger === "string" ? s.data.trigger : "";
          if (trigger === "mk" && plugin.settings.inlineMathTrigger) {
            trigger = plugin.settings.inlineMathTrigger;
          } else if (trigger === "dm" && plugin.settings.displayMathTrigger) {
            trigger = plugin.settings.displayMathTrigger;
          }

          if (trigger && textBefore.endsWith(trigger)) {
            const triggerLen = trigger.length;
            const replaceFrom = pos - (triggerLen - 1);

            let replacementRaw = "";
            if (s.data.replacement && (s.data.replacement as any).nodes) {
              const nodes = (s.data.replacement as any).nodes;
              replacementRaw = nodes.map((n: any) => typeof n.insert === "string" ? n.insert : "").join("");
            }

            const { text: replacementText, initialCursorOffset } = computeSnippetExpansion(replacementRaw);

            view.dispatch({
              changes: { from: replaceFrom, to: pos, insert: replacementText },
              selection: { anchor: replaceFrom + initialCursorOffset, head: replaceFrom + initialCursorOffset },
            });
            event.preventDefault();
            return true;
          }
        }

        return false;
      },
    }),
  );

  // ── Tab Navigation & Tabout ──
  const tabKeybinding: KeyBinding = {
    key: "Tab",
    run: (view: EditorView) => {
      if (!plugin.settings.enableLaTeXSuite || !plugin.settings.taboutOnTab) return false;
      const mainSel = view.state.selection.main;
      if (!mainSel.empty) return false;
      const pos = mainSel.head;
      const docStr = view.state.doc.toString();

      // 1. Immediately followed by closing bracket or math delimiter
      const charAfter = docStr.slice(pos, pos + 2);
      if (charAfter.startsWith("}") || charAfter.startsWith("]") || charAfter.startsWith(")")) {
        view.dispatch({
          selection: { anchor: pos + 1, head: pos + 1 },
        });
        return true;
      }
      if (charAfter.startsWith("$$")) {
        view.dispatch({
          selection: { anchor: pos + 2, head: pos + 2 },
        });
        return true;
      }
      if (charAfter.startsWith("$")) {
        view.dispatch({
          selection: { anchor: pos + 1, head: pos + 1 },
        });
        return true;
      }

      // 2. Scan forward for next field delimiter (}, ], ), $, or $$) within 80 chars
      for (let offset = 1; offset < 80 && pos + offset <= docStr.length; offset++) {
        const ch = docStr[pos + offset - 1];
        if (ch === "}" || ch === "]" || ch === ")" || ch === "$") {
          view.dispatch({
            selection: { anchor: pos + offset, head: pos + offset },
          });
          return true;
        }
      }

      return false;
    },
  };

  const shiftTabKeybinding: KeyBinding = {
    key: "Shift-Tab",
    run: (view: EditorView) => {
      if (!plugin.settings.enableLaTeXSuite || !plugin.settings.taboutOnTab) return false;
      const mainSel = view.state.selection.main;
      if (!mainSel.empty) return false;
      const pos = mainSel.head;

      const docStr = view.state.doc.toString();
      for (let offset = 1; offset < 80 && pos - offset >= 0; offset--) {
        const ch = docStr[pos - offset];
        if (ch === "{" || ch === "[" || ch === "(" || ch === "$") {
          view.dispatch({
            selection: { anchor: pos - offset, head: pos - offset },
          });
          return true;
        }
      }
      return false;
    },
  };

  return [keydownExtension, Prec.high(keymap.of([tabKeybinding, shiftTabKeybinding]))];
}

export function computeSnippetExpansion(replacementRaw: string): { text: string; initialCursorOffset: number; tabstops: TabstopGroup[] } {
  const snippetNode = new SnippetTabstopOnlyNode(replacementRaw);
  const { insert: text, tabstops: rawSpecs } = snippetNode.applyInsert(emptyInsertOptions);

  const tabstopGroups = tabstopSpecsToTabstopGroups(rawSpecs);

  let initialCursorOffset = text.length;
  if (tabstopGroups.length > 0) {
    const firstGroup = tabstopGroups[0];
    if (firstGroup.ranges.length > 0) {
      initialCursorOffset = firstGroup.ranges[0].from;
    }
  }

  return { text, initialCursorOffset, tabstops: tabstopGroups };
}
