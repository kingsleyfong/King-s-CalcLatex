/**
 * King's CalcLatex v2 — Tab-to-Insert Keymap
 *
 * Intercepts Tab when the cursor is anywhere inside a math block that
 * contains an evaluation trigger, evaluates the expression, and inserts
 * the result text AFTER the trigger character.
 *
 * Insertion position rule (learned from runtime bug 2026-03-16):
 *   Insert at trigger.to (AFTER the trigger symbol like "=" or "\approx"),
 *   NOT at trigger.from (before it).
 *
 *   $2+3=$  →  Tab  →  $2+3= 5$
 *              ↑ cursor anywhere inside $...$
 *
 * After insertion, the content no longer ends with the trigger character,
 * so the trigger detection will not fire again.
 */

import { keymap, EditorView } from "@codemirror/view";
import { Prec, type Extension } from "@codemirror/state";
import type { TriggerMatch } from "../types";
import { detectTriggers } from "./triggers";

/**
 * Create a highest-precedence keymap that intercepts Tab near KCL triggers.
 */
export function createTabKeymap(plugin: any): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "Tab",
        run(view: EditorView): boolean {
          const state = view.state;
          const cursor = state.selection.main.head;
          const line = state.doc.lineAt(cursor);

          const triggers = detectTriggers(line.text, line.from);
          if (triggers.length === 0) return false;

          // Find a trigger whose math block contains the cursor.
          // This is more reliable than distance-to-trigger-end checks.
          const activeTrigger = triggers.find((t) => {
            if (t.mathRange) {
              // Cursor must be inside the math delimiters (inclusive of closing $)
              return cursor >= t.mathRange.from && cursor <= t.mathRange.to;
            }
            // Fallback: cursor near the trigger keyword itself
            return cursor >= t.from && cursor <= t.to + 1;
          });

          if (!activeTrigger) return false;

          // Only evaluate/convert triggers produce insertable text.
          // Plot and persist triggers don't — let Tab fall through for those.
          if (activeTrigger.kind !== "evaluate" && activeTrigger.kind !== "convert") {
            return false;
          }

          // Kick off async evaluation and insert
          void handleTabInsertion(view, plugin, activeTrigger);
          return true; // consumed — prevent Obsidian's default Tab behavior
        },
      },
    ])
  );
}

// ══════════════════════════════════════════════════════════════
//  INSERTION HANDLER
// ══════════════════════════════════════════════════════════════

async function handleTabInsertion(
  view: EditorView,
  plugin: any,
  trigger: TriggerMatch
): Promise<void> {
  try {
    let resultText: string | undefined;

    if (trigger.kind === "convert") {
      // mode is stored as "convert:UNIT" (e.g., "convert:ft")
      const targetUnit = trigger.mode.includes(":")
        ? trigger.mode.split(":")[1]
        : trigger.mode;

      const value = parseFloat(trigger.latex);
      if (isNaN(value)) return;

      const result = await plugin.engine.convert(value, "unit", targetUnit);
      if (!result.ok) return;
      resultText = result.value;
    } else {
      // evaluate: exact / approximate / simplify / solve / factor
      const result = await plugin.engine.evaluate(trigger.latex, trigger.mode);
      if (!result.ok) return;
      // Use LaTeX form for insertion since the text goes inside $...$
      resultText = result.value.latex || result.value.text;
    }

    if (!resultText || resultText.trim() === "") return;

    // ── Insertion position ────────────────────────────────────
    //
    // Insert AFTER the trigger keyword (trigger.to), so the final
    // text is: $expr= result$   (the "=" stays, result follows it)
    //
    // This means the content of the math block no longer ends with
    // the trigger character, so no re-trigger occurs.
    //
    // Example:
    //   Before: $2+3=$        trigger.to = position after "="
    //   Insert:  " 5" at trigger.to
    //   After:  $2+3= 5$      content "2+3= 5" → no "=" at end → no trigger
    //
    const insertPos = trigger.to;
    const insertText = ` ${resultText}`;

    // Check view is still valid before dispatching
    if (view.state.doc.length < insertPos) return;

    view.dispatch({
      changes: { from: insertPos, to: insertPos, insert: insertText },
      // Place cursor after the inserted result
      selection: { anchor: insertPos + insertText.length },
    });
  } catch {
    // Silently fail — the inline widget still shows the result
  }
}
