import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { MathContextManager } from "../utils/context";
import { queueSnippets } from "../snippets/codemirror/snippet_queue_state_field";
import { SnippetChangeSpec } from "../snippets/codemirror/snippet_change_spec";
import { expandSnippets } from "../snippets/snippet_management";
import { SnippetTabstopOnlyNode, emptyInsertOptions } from "../snippets/luasnip_api/node";
import { parseRawSnippetsFromStr } from "../snippets/parse";
import { DEFAULT_LATEX_SUITE_SNIPPETS_RAW_STRING } from "../../snippets/default-snippets";
import type KingsCalcLatexPlugin from "../../main";

const defaultParsedSnippets = parseRawSnippetsFromStr(DEFAULT_LATEX_SUITE_SNIPPETS_RAW_STRING);

const WORD_DELIMITERS = "., +-\n\t:;!?\\/{}[]()=~$'\"|`<>*^%#@&";

function isWordBoundary(char: string | undefined): boolean {
  if (!char) return true;
  return WORD_DELIMITERS.includes(char);
}

export function runSnippetsOnInput(view: EditorView, key: string, plugin: KingsCalcLatexPlugin): boolean {
  if (plugin.settings.enableLaTeXSuite === false) return false;

  const state = view.state;
  const mainSel = state.selection.main;
  const pos = mainSel.head;
  const line = state.doc.lineAt(pos);
  const lineText = line.text;
  const col = pos - line.from;

  const textBefore = lineText.slice(0, col) + key;
  const inMath = MathContextManager.isMathMode(state, pos);

  // Visual Selection Replacements (${VISUAL})
  if (!mainSel.empty) {
    const selectedText = state.sliceDoc(mainSel.from, mainSel.to);
    for (const s of defaultParsedSnippets) {
      const opts = s.options || "";
      const isMathOnly = opts.includes("m");
      const isTextOnly = opts.includes("t");
      const autoExpand = opts.includes("A");

      if (!autoExpand) continue;
      if (isMathOnly && !inMath) continue;
      if (isTextOnly && inMath) continue;

      const trigger = typeof s.data.trigger === "string" ? s.data.trigger : "";
      if (trigger === key && s.rawReplacement.includes("${VISUAL}")) {
        const replacementExpanded = s.rawReplacement.replace(/\$\{VISUAL\}/g, selectedText);
        const snippetNode = new SnippetTabstopOnlyNode(replacementExpanded);
        const resultInsert = snippetNode.applyInsert(emptyInsertOptions);

        const changeSpec = new SnippetChangeSpec(mainSel.from, mainSel.to, resultInsert, key);
        queueSnippets(view, [changeSpec]);
        expandSnippets(view);
        return true;
      }
    }
    return false;
  }

  // Auto-Expanding Snippet Triggers
  for (const s of defaultParsedSnippets) {
    const opts = s.options || "";
    const isMathOnly = opts.includes("m");
    const isTextOnly = opts.includes("t");
    const autoExpand = opts.includes("A");
    const isWordOnly = opts.includes("w");

    if (!autoExpand) continue;
    if (isMathOnly && !inMath) continue;
    if (isTextOnly && inMath) continue;

    if (s.type === "string") {
      let trigger = typeof s.data.trigger === "string" ? s.data.trigger : "";
      if (trigger === "mk" && plugin.settings.inlineMathTrigger) {
        trigger = plugin.settings.inlineMathTrigger;
      } else if (trigger === "dm" && plugin.settings.displayMathTrigger) {
        trigger = plugin.settings.displayMathTrigger;
      }

      if (trigger && textBefore.endsWith(trigger)) {
        const triggerLen = trigger.length;
        const triggerStartCol = col - triggerLen;

        if (isWordOnly && triggerStartCol > 0) {
          const charBefore = lineText[triggerStartCol - 1];
          if (!isWordBoundary(charBefore)) continue;
        }

        const replaceFrom = pos - triggerLen;

        const snippetNode = new SnippetTabstopOnlyNode(s.rawReplacement);
        const resultInsert = snippetNode.applyInsert(emptyInsertOptions);

        const changeSpec = new SnippetChangeSpec(replaceFrom, pos, resultInsert, key);
        queueSnippets(view, [changeSpec]);
        expandSnippets(view);

        return true;
      }
    } else if (s.type === "regex" && plugin.settings.enableRegexSnippets !== false) {
      const reg = s.data.trigger as RegExp;
      const match = reg.exec(textBefore);
      if (match) {
        const matchLen = match[0].length;
        const replaceFrom = pos - matchLen;

        let replacementStr = s.rawReplacement;
        for (let mIdx = 0; mIdx < match.length; mIdx++) {
          replacementStr = replacementStr.replace(new RegExp(`\\[\\[${mIdx}\\]\\]`, "g"), match[mIdx]);
        }

        const snippetNode = new SnippetTabstopOnlyNode(replacementStr);
        const resultInsert = snippetNode.applyInsert(emptyInsertOptions);

        const changeSpec = new SnippetChangeSpec(replaceFrom, pos, resultInsert, key);
        queueSnippets(view, [changeSpec]);
        expandSnippets(view);

        return true;
      }
    }
  }

  return false;
}
