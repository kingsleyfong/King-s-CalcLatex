import { EditorView, KeyBinding, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_LATEX_SUITE_SNIPPETS, RawSnippet } from "./default-snippets";

export function createLaTeXSnippetExtension(plugin: KingsCalcLatexPlugin) {
  const inputExtension = EditorView.inputHandler.of((view, from, to, text) => {
    if (!plugin.settings.enableLaTeXSuite) return false;
    if (text.length !== 1) return false;

    const state = view.state;
    const pos = from;
    const line = state.doc.lineAt(pos);
    const lineText = line.text;
    const col = pos - line.from;

    const textBefore = lineText.slice(0, col) + text;
    const inMath = isInsideMathModeCM6(state, pos);

    // 1. Auto-subscript digits (e.g. x1 -> x_1, a2 -> a_2)
    if (plugin.settings.enableAutoSubscript && inMath && /\d/.test(text)) {
      const prevChar = lineText.slice(col - 1, col);
      if (/[a-zA-Z]/.test(prevChar)) {
        const replaceFrom = pos - 1;
        const insertText = `${prevChar}_${text}`;
        view.dispatch({
          changes: { from: replaceFrom, to: pos, insert: insertText },
          selection: { anchor: replaceFrom + insertText.length, head: replaceFrom + insertText.length },
        });
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

      // Check for custom triggers (e.g. inlineMathTrigger, displayMathTrigger)
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
        return true;
      }
    }

    return false;
  });

  const tabKeybinding: KeyBinding = {
    key: "Tab",
    run: (view: EditorView) => {
      if (!plugin.settings.enableLaTeXSuite) return false;
      const mainSel = view.state.selection.main;
      const pos = mainSel.head;
      const docStr = view.state.doc.toString();

      const nextDollar = docStr.indexOf("$", pos);
      if (nextDollar !== -1 && nextDollar - pos < 60) {
        view.dispatch({
          selection: { anchor: nextDollar, head: nextDollar },
        });
        return true;
      }
      return false;
    },
  };

  return [inputExtension, keymap.of([tabKeybinding])];
}

function isInsideMathModeCM6(state: EditorState, pos: number): boolean {
  try {
    const tree = syntaxTree(state);
    let inMath = false;
    tree.iterate({
      from: Math.max(0, pos - 1),
      to: Math.min(state.doc.length, pos + 1),
      enter(node) {
        if (
          node.name.includes("math") ||
          node.name.includes("Formula") ||
          node.name.includes("katex") ||
          node.name.includes("formatting-math")
        ) {
          inMath = true;
        }
      },
    });
    if (inMath) return true;
  } catch {}

  // Fallback counting non-escaped dollar signs
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
