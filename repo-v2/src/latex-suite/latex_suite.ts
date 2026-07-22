import { EditorView, KeyBinding, keymap, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_LATEX_SUITE_SNIPPETS } from "../snippets/default-snippets";
import { MathContextManager } from "./utils/context";
import { parseRawSnippets } from "./snippets/parse";
import { SnippetTabstopOnlyNode, emptyInsertOptions } from "./snippets/luasnip_api/node";
import { tabstopSpecsToTabstopGroups } from "./snippets/tabstop";
import { tabstopsStateField } from "./snippets/codemirror/tabstops_state_field";
import { snippetQueuePlugin, queueSnippets } from "./snippets/codemirror/snippet_queue_state_field";
import { SnippetChangeSpec } from "./snippets/codemirror/snippet_change_spec";
import { expandSnippets } from "./snippets/snippet_management";

export function createLaTeXSuiteEngineExtension(plugin: KingsCalcLatexPlugin) {
  const parsedDefaultSnippets = parseRawSnippets(DEFAULT_LATEX_SUITE_SNIPPETS);

  const latexSuitePlugin = ViewPlugin.fromClass(
    class {
      constructor(public view: EditorView) {}
      update(update: ViewUpdate) {}

      handleKeydown(event: KeyboardEvent): boolean {
        if (plugin.settings.enableLaTeXSuite === false) return false;
        if (event.ctrlKey || event.altKey || event.metaKey) return false;
        if (event.key.length !== 1) return false;

        const view = this.view;
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

        // 1. Auto-subscript digits (e.g. x1 -> x_1)
        if (plugin.settings.enableAutoSubscript && inMath && /\d/.test(charTyped)) {
          const prevChar = lineText.slice(col - 1, col);
          if (/[a-zA-Z]/.test(prevChar)) {
            const replaceFrom = pos - 1;
            const insertText = `${prevChar}_${charTyped}`;

            view.dispatch({
              changes: { from: replaceFrom, to: pos, insert: insertText },
              selection: { anchor: replaceFrom + insertText.length, head: replaceFrom + insertText.length },
              userEvent: "input.type",
              scrollIntoView: true,
            });
            return true;
          }
        }

        // 2. Snippet Trigger Processing
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

            const snippetNode = new SnippetTabstopOnlyNode(s.rawReplacement);
            const resultInsert = snippetNode.applyInsert(emptyInsertOptions);

            const changeSpec = new SnippetChangeSpec(replaceFrom, pos, resultInsert, charTyped);
            queueSnippets(view, [changeSpec]);

            // Queue expansion via microtask to flush queued change spec cleanly
            queueMicrotask(() => {
              expandSnippets(view);
            });

            return true;
          }
        }

        return false;
      }
    },
    {
      eventHandlers: {
        keydown(event: KeyboardEvent, view: EditorView) {
          const pluginInst = view.plugin(latexSuitePlugin);
          if (pluginInst) {
            if (pluginInst.handleKeydown(event)) {
              event.preventDefault();
            }
          }
        },
      },
    },
  );

  // Tab & Shift-Tab Keybindings
  const tabKeybinding: KeyBinding = {
    key: "Tab",
    run: (view: EditorView) => {
      if (plugin.settings.enableLaTeXSuite === false) return false;
      const state = view.state;
      const tsState = state.field(tabstopsStateField, false);

      // 1. Jump through active tabstops if present
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

      // 2. Tabout of delimiters
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
    Prec.highest(latexSuitePlugin.extension),
    Prec.high(keymap.of([tabKeybinding, shiftTabKeybinding])),
  ];
}
