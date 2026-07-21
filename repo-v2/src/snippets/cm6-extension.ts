import { ViewPlugin, ViewUpdate, EditorView, KeyBinding, keymap } from "@codemirror/view";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_LATEX_SUITE_SNIPPETS } from "./default-snippets";

export function createLaTeXSnippetExtension(plugin: KingsCalcLatexPlugin) {
  let isExpanding = false;

  const pluginView = ViewPlugin.fromClass(
    class {
      constructor(public view: EditorView) {}

      update(update: ViewUpdate) {
        if (!plugin.settings.enableLaTeXSuite) return;
        if (!update.docChanged || isExpanding) return;

        const mainSel = update.state.selection.main;
        if (!mainSel.empty) return;

        const pos = mainSel.head;
        const line = update.state.doc.lineAt(pos);
        const lineText = line.text;
        const col = pos - line.from;

        const textBefore = lineText.slice(0, col);
        const inMath = isInsideMathMode(update.state.doc.toString(), pos);

        const snippets = DEFAULT_LATEX_SUITE_SNIPPETS;

        for (const s of snippets) {
          const opts = s.options || "";
          const isMathOnly = opts.includes("m");
          const isTextOnly = opts.includes("t");
          const autoExpand = opts.includes("A");

          if (!autoExpand) continue;
          if (isMathOnly && !inMath) continue;
          if (isTextOnly && inMath) continue;

          if (textBefore.endsWith(s.trigger)) {
            isExpanding = true;
            try {
              const fromPos = pos - s.trigger.length;
              const { text: replacementText, cursorOffset } = parseSnippetReplacement(s.replacement);

              this.view.dispatch({
                changes: { from: fromPos, to: pos, insert: replacementText },
                selection: { anchor: fromPos + cursorOffset, head: fromPos + cursorOffset },
              });
            } finally {
              isExpanding = false;
            }
            break;
          }
        }
      }
    },
  );

  const tabKeybinding: KeyBinding = {
    key: "Tab",
    run: (view: EditorView) => {
      if (!plugin.settings.enableLaTeXSuite) return false;
      const mainSel = view.state.selection.main;
      const pos = mainSel.head;
      const docStr = view.state.doc.toString();

      // Simple tabstop jump to next $0 or end of math mode
      const nextDollar = docStr.indexOf("$", pos);
      if (nextDollar !== -1 && nextDollar - pos < 50) {
        view.dispatch({
          selection: { anchor: nextDollar, head: nextDollar },
        });
        return true;
      }
      return false;
    },
  };

  return [pluginView, keymap.of([tabKeybinding])];
}

function isInsideMathMode(fullText: string, pos: number): boolean {
  let inMath = false;
  let i = 0;
  while (i < pos) {
    if (fullText[i] === "$") {
      if (i + 1 < fullText.length && fullText[i + 1] === "$") {
        inMath = !inMath;
        i += 2;
        continue;
      } else {
        inMath = !inMath;
        i += 1;
        continue;
      }
    }
    i++;
  }
  return inMath;
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
