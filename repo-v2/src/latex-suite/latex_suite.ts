import { EditorView, KeyBinding, keymap, tooltips, Tooltip } from "@codemirror/view";
import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import { renderMath, finishRenderMath } from "obsidian";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_LATEX_SUITE_SNIPPETS } from "../snippets/default-snippets";
import { MathContextManager } from "./utils/context";
import { parseRawSnippets } from "./snippets/parse";
import { SnippetTabstopOnlyNode, emptyInsertOptions } from "./snippets/luasnip_api/node";
import { tabstopSpecsToTabstopGroups, TabstopGroup } from "./snippets/tabstop";

// ── 1. Tabstop StateField & Effects ──
const addTabstopsEffect = StateEffect.define<TabstopGroup[]>();
const removeAllTabstopsEffect = StateEffect.define();

type TabstopsState = {
  index: number;
  tabstopGroups: TabstopGroup[];
};

export const tabstopsStateField = StateField.define<TabstopsState>({
  create() {
    return { index: 0, tabstopGroups: [] };
  },
  update(value, transaction) {
    let tabstopGroups = value.tabstopGroups;
    tabstopGroups.forEach((grp) => {
      grp.ranges = grp.ranges.map((r) => ({
        from: transaction.changes.mapPos(r.from, 1),
        to: transaction.changes.mapPos(r.to, 1),
      }));
    });

    for (const effect of transaction.effects) {
      if (effect.is(addTabstopsEffect)) {
        tabstopGroups = [...effect.value];
      } else if (effect.is(removeAllTabstopsEffect)) {
        tabstopGroups = [];
      }
    }

    return { index: value.index, tabstopGroups };
  },
});

// ── 2. Math Preview Tooltip StateField ──
const setMathPreviewEffect = StateEffect.define<Tooltip[]>();

export const mathPreviewStateField = StateField.define<Tooltip[]>({
  create() {
    return [];
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setMathPreviewEffect)) {
        return effect.value;
      }
    }
    return value;
  },
  provide: (field) => tooltips.computeN([field], (state) => state.field(field)),
});

const mathPreviewTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-tooltip-cursor": {
    backgroundColor: "var(--background-secondary)",
    color: "var(--text-normal)",
    border: "1px solid var(--background-modifier-border-hover)",
    padding: "4px 8px",
    borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    fontSize: "14px",
    zIndex: "100",
    "& p": { margin: "0px" },
    "& mjx-container": { padding: "2px !important" },
  },
});

// ── 3. Main LaTeX Suite Engine Extension ──
export function createLaTeXSuiteEngineExtension(plugin: KingsCalcLatexPlugin) {
  const parsedDefaultSnippets = parseRawSnippets(DEFAULT_LATEX_SUITE_SNIPPETS);

  // Keydown Trigger Extension
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

        // Auto-subscript digits (e.g. x1 -> x_1)
        if (plugin.settings.enableAutoSubscript && inMath && /\d/.test(charTyped)) {
          const prevChar = lineText.slice(col - 1, col);
          if (/[a-zA-Z]/.test(prevChar)) {
            event.preventDefault();
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

        // Snippet Trigger Processing
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
            event.preventDefault();

            const triggerLen = trigger.length;
            const replaceFrom = pos - (triggerLen - 1);

            let replacementRaw = "";
            if (s.data.replacement && (s.data.replacement as any).nodes) {
              const nodes = (s.data.replacement as any).nodes;
              replacementRaw = nodes.map((n: any) => (typeof n.insert === "string" ? n.insert : "")).join("");
            }

            const { text: replacementText, initialCursorOffset, tabstopGroups } = computeSnippetExpansion(replacementRaw);
            const targetCursorPos = replaceFrom + initialCursorOffset;

            // Map tabstop ranges relative to replaceFrom
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
              changes: { from: replaceFrom, to: pos, insert: replacementText },
              selection: { anchor: targetCursorPos, head: targetCursorPos },
              effects: [addTabstopsEffect.of(mappedTabstops)],
              userEvent: "input.type",
              scrollIntoView: true,
            });

            // Microtask selection lock
            setTimeout(() => {
              try {
                if (view.state.doc.length >= targetCursorPos) {
                  view.dispatch({
                    selection: { anchor: targetCursorPos, head: targetCursorPos },
                    scrollIntoView: true,
                  });
                }
              } catch {}
            }, 0);

            return true;
          }
        }

        return false;
      },
    }),
  );

  // Tab & Shift-Tab Keybindings
  const tabKeybinding: KeyBinding = {
    key: "Tab",
    run: (view: EditorView) => {
      if (!plugin.settings.enableLaTeXSuite) return false;
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
      if (!plugin.settings.enableLaTeXSuite) return false;
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

  // Math Preview Update Listener
  const mathPreviewUpdateListener = EditorView.updateListener.of((update) => {
    if (!plugin.settings.enableLaTeXSuite) return;
    if (!update.docChanged && !update.selectionSet) return;

    const view = update.view;
    const state = view.state;
    const pos = state.selection.main.head;
    const inMath = MathContextManager.isMathMode(state, pos);

    if (!inMath) {
      if (state.field(mathPreviewStateField).length > 0) {
        view.dispatch({ effects: [setMathPreviewEffect.of([])] });
      }
      return;
    }

    const docStr = state.doc.toString();
    let startPos = pos;
    while (startPos > 0 && docStr[startPos - 1] !== "$") {
      startPos--;
    }
    let endPos = pos;
    while (endPos < docStr.length && docStr[endPos] !== "$") {
      endPos++;
    }

    const rawMathText = docStr.slice(startPos, endPos).trim();
    if (!rawMathText) {
      view.dispatch({ effects: [setMathPreviewEffect.of([])] });
      return;
    }

    const relCursor = Math.max(0, Math.min(pos - startPos, rawMathText.length));
    const mathWithCursor = rawMathText.slice(0, relCursor) + "▶" + rawMathText.slice(relCursor);
    const isDisplay = docStr.slice(Math.max(0, startPos - 2), startPos) === "$$";

    const tooltip: Tooltip = {
      pos: startPos,
      above: true,
      strictSide: true,
      arrow: true,
      create: () => {
        const container = document.createElement("div");
        container.className = "cm-tooltip-cursor cm-tooltip-above";

        try {
          const renderedEl = renderMath(mathWithCursor, isDisplay);
          container.appendChild(renderedEl);
          finishRenderMath();
        } catch (e) {
          container.textContent = rawMathText;
        }

        return { dom: container };
      },
    };

    view.dispatch({ effects: [setMathPreviewEffect.of([tooltip])] });
  });

  return [
    tabstopsStateField,
    mathPreviewStateField,
    mathPreviewTheme,
    tooltips({ position: "absolute" }),
    keydownExtension,
    Prec.high(keymap.of([tabKeybinding, shiftTabKeybinding])),
    mathPreviewUpdateListener,
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
