import { EditorView, KeyBinding, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_LATEX_SUITE_SNIPPETS, RawSnippet } from "./default-snippets";

export function createLaTeXSnippetExtension(plugin: KingsCalcLatexPlugin) {
  const eventHandler = EditorView.domEventHandlers({
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
      const inMath = isMathMode(state, pos);

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
      const snippets = getActiveSnippetsList(plugin);

      for (const s of snippets) {
        const opts = s.options || "";
        const isMathOnly = opts.includes("m");
        const isTextOnly = opts.includes("t");
        const autoExpand = opts.includes("A");

        if (!autoExpand) continue;
        if (isMathOnly && !inMath) continue;
        if (isTextOnly && inMath) continue;

        let trigger = s.trigger;
        if (trigger === "mk" && plugin.settings.inlineMathTrigger) {
          trigger = plugin.settings.inlineMathTrigger;
        } else if (trigger === "dm" && plugin.settings.displayMathTrigger) {
          trigger = plugin.settings.displayMathTrigger;
        }

        if (textBefore.endsWith(trigger)) {
          const triggerLen = trigger.length;
          const replaceFrom = pos - (triggerLen - 1);

          const { text: replacementText, cursorOffset } = parseSnippetReplacement(s.replacement);

          view.dispatch({
            changes: { from: replaceFrom, to: pos, insert: replacementText },
            selection: { anchor: replaceFrom + cursorOffset, head: replaceFrom + cursorOffset },
          });
          event.preventDefault();
          return true;
        }
      }

      return false;
    },
  });

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

  return [eventHandler, keymap.of([tabKeybinding, shiftTabKeybinding])];
}

function isMathMode(state: EditorState, pos: number): boolean {
  try {
    const tree = syntaxTree(state);
    let node: any = tree.resolveInner(pos, -1);
    while (node) {
      const name: string = node.name || "";
      // Container nodes break to fallback dollar count
      if (name === "Document" || name === "paragraph" || name === "line" || name.startsWith("HyperMD")) {
        break;
      }
      if (
        name.includes("formatting-math") ||
        name.includes("math-inline") ||
        name.includes("math-block") ||
        name.includes("katex")
      ) {
        return true;
      }
      if (!node.parent) break;
      node = node.parent;
    }
  } catch {}

  const docStr = state.doc.toString();
  let count = 0;
  for (let i = 0; i < pos; i++) {
    if (docStr[i] === "$" && (i === 0 || docStr[i - 1] !== "\\")) {
      count++;
    }
  }
  return count % 2 === 1;
}

function getActiveSnippetsList(plugin: KingsCalcLatexPlugin): RawSnippet[] {
  let list = [...DEFAULT_LATEX_SUITE_SNIPPETS];
  if (plugin.settings.customSnippetsText) {
    try {
      const parsed = JSON.parse(plugin.settings.customSnippetsText);
      if (Array.isArray(parsed)) {
        list = [...parsed, ...list];
      }
    } catch {}
  }
  return list;
}

function parseSnippetReplacement(rep: string): { text: string; cursorOffset: number } {
  let text = rep;
  let cursorOffset = rep.length;

  if (text.includes("$0")) {
    cursorOffset = text.indexOf("$0");
    text = text.replace(/\$0/g, "");
  } else if (text.includes("$1")) {
    cursorOffset = text.indexOf("$1");
    text = text.replace(/\$\d+/g, "");
  }

  return { text, cursorOffset };
}
