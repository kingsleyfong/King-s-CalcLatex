import { EditorView, KeyBinding, keymap, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_LATEX_SUITE_SNIPPETS_RAW_STRING } from "../snippets/default-snippets";
import { MathContextManager } from "./utils/context";
import { parseRawSnippetsFromStr } from "./snippets/parse";
import { SnippetTabstopOnlyNode, emptyInsertOptions } from "./snippets/luasnip_api/node";
import { tabstopSpecsToTabstopGroups, TabstopGroup } from "./snippets/tabstop";
import { tabstopsStateField, addTabstopsEffect } from "./snippets/codemirror/tabstops_state_field";
import { snippetQueuePlugin, queueSnippets } from "./snippets/codemirror/snippet_queue_state_field";
import { SnippetChangeSpec } from "./snippets/codemirror/snippet_change_spec";
import { expandSnippets } from "./snippets/snippet_management";

// ── LaTeX Suite Extension Bundle Coordinator ──
export function createLaTeXSuiteEngineExtension(plugin: KingsCalcLatexPlugin) {
  // If LaTeX Suite feature toggle is disabled, return empty array (100% disabled & isolated)
  if (plugin.settings.enableLaTeXSuite === false) {
    return [];
  }

  const parsedDefaultSnippets = parseRawSnippetsFromStr(DEFAULT_LATEX_SUITE_SNIPPETS_RAW_STRING);

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

        const pos = mainSel.head;
        const line = state.doc.lineAt(pos);
        const lineText = line.text;
        const col = pos - line.from;

        const charTyped = event.key;
        const textBefore = lineText.slice(0, col) + charTyped;
        const inMath = MathContextManager.isMathMode(state, pos);

        // Visual selection snippets (Shift-U, Shift-K, Shift-C, Shift-S, Shift-O, Shift-B, etc.)
        if (!mainSel.empty) {
          const selectedText = state.sliceDoc(mainSel.from, mainSel.to);
          for (const s of parsedDefaultSnippets) {
            const opts = s.options || "";
            const isMathOnly = opts.includes("m");
            const isTextOnly = opts.includes("t");
            const autoExpand = opts.includes("A");

            if (!autoExpand) continue;
            if (isMathOnly && !inMath) continue;
            if (isTextOnly && inMath) continue;

            const trigger = typeof s.data.trigger === "string" ? s.data.trigger : "";
            if (trigger === charTyped && s.rawReplacement.includes("${VISUAL}")) {
              event.preventDefault();
              const replacementExpanded = s.rawReplacement.replace(/\$\{VISUAL\}/g, selectedText);
              const snippetNode = new SnippetTabstopOnlyNode(replacementExpanded);
              const resultInsert = snippetNode.applyInsert(emptyInsertOptions);

              const changeSpec = new SnippetChangeSpec(mainSel.from, mainSel.to, resultInsert, charTyped);
              queueSnippets(view, [changeSpec]);

              queueMicrotask(() => {
                expandSnippets(view);
              });
              return true;
            }
          }
          return false;
        }

        // Snippet Trigger Processing (String & Regex)
        for (const s of parsedDefaultSnippets) {
          const opts = s.options || "";
          const isMathOnly = opts.includes("m");
          const isTextOnly = opts.includes("t");
          const autoExpand = opts.includes("A");

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
              const replaceFrom = pos - (triggerLen - 1);

              const snippetNode = new SnippetTabstopOnlyNode(s.rawReplacement);
              const resultInsert = snippetNode.applyInsert(emptyInsertOptions);

              const changeSpec = new SnippetChangeSpec(replaceFrom, pos, resultInsert, charTyped);
              queueSnippets(view, [changeSpec]);

              queueMicrotask(() => {
                expandSnippets(view);
              });

              return true;
            }
          } else if (s.type === "regex" && plugin.settings.enableRegexSnippets !== false) {
            const reg = s.data.trigger as RegExp;
            const match = reg.exec(textBefore);
            if (match) {
              const matchLen = match[0].length;
              const replaceFrom = pos - (matchLen - 1);

              let replacementStr = s.rawReplacement;
              for (let mIdx = 0; mIdx < match.length; mIdx++) {
                replacementStr = replacementStr.replace(new RegExp(`\\[\\[${mIdx}\\]\\]`, "g"), match[mIdx]);
              }

              const snippetNode = new SnippetTabstopOnlyNode(replacementStr);
              const resultInsert = snippetNode.applyInsert(emptyInsertOptions);

              const changeSpec = new SnippetChangeSpec(replaceFrom, pos, resultInsert, charTyped);
              queueSnippets(view, [changeSpec]);

              queueMicrotask(() => {
                expandSnippets(view);
              });

              return true;
            }
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

  // Auto-fraction keybinding for "/"
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
    Prec.high(keymap.of([autofractionKeybinding, tabKeybinding, shiftTabKeybinding])),
  ];
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
