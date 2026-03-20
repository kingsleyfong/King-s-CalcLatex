/**
 * King's CalcLatex v2 — CM6 Decoration Extension
 *
 * CRITICAL ARCHITECTURE NOTE (learned from runtime error 2026-03-16):
 *
 *   ViewPlugin.decorations  →  CANNOT include block: true widgets.
 *   StateField + EditorView.decorations.from(f)  →  CAN include block: true.
 *
 * Obsidian throws "Block decorations may not be specified via plugins"
 * when block widgets are returned from ViewPlugin.decorations. The only
 * correct approach for block widgets (graphs) is a StateField.
 *
 * The v1-fix still applies: on selection-only changes (tr.docChanged === false),
 * we return the existing DecorationSet unchanged.
 */

import {
  StateField,
  RangeSetBuilder,
  type EditorState,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type WidgetType,
} from "@codemirror/view";
import type { TriggerMatch } from "../types";
import { detectTriggers } from "./triggers";
import { ResultWidget, Graph2DWidget, Graph3DWidget } from "./widgets";

// ══════════════════════════════════════════════════════════════
//  WIDGET FACTORY
// ══════════════════════════════════════════════════════════════

function createWidget(plugin: any, trigger: TriggerMatch): WidgetType {
  const baseMode = trigger.mode.split(":")[0];
  switch (baseMode) {
    case "plot2d":
    case "contour":
    case "gradient":
    case "region":
      return new Graph2DWidget(plugin, trigger);
    case "vecfield": {
      // Route to 3D if expression has 3+ semicolon-separated parts or references z
      const parts = trigger.latex.split(";").filter(s => s.trim());
      const hasZ = /(?:^|[^a-zA-Z])z(?:$|[^a-zA-Z])/.test(trigger.latex);
      return (parts.length >= 3 || hasZ)
        ? new Graph3DWidget(plugin, trigger)
        : new Graph2DWidget(plugin, trigger);
    }
    case "plot3d":
    case "geometry":
    case "tangent":
      return new Graph3DWidget(plugin, trigger);
    default:
      return new ResultWidget(plugin, trigger);
  }
}

function isBlockWidget(trigger: TriggerMatch): boolean {
  return trigger.kind === "plot";
}

// ══════════════════════════════════════════════════════════════
//  DECORATION BUILDER
// ══════════════════════════════════════════════════════════════

function buildDecorationsFromState(state: EditorState, plugin: any): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (let lineNum = 1; lineNum <= state.doc.lines; lineNum++) {
    const line = state.doc.line(lineNum);
    const triggers = detectTriggers(line.text, line.from);

    for (const trigger of triggers) {
      const widget = createWidget(plugin, trigger);
      const block = isBlockWidget(trigger);
      // Place decoration at the end of the full math block (after closing $)
      const pos = trigger.mathRange ? trigger.mathRange.to : trigger.to;

      builder.add(
        pos,
        pos,
        Decoration.widget({ widget, side: 1, block })
      );
    }
  }

  return builder.finish();
}

// ══════════════════════════════════════════════════════════════
//  STATE FIELD (the only correct home for block widgets)
// ══════════════════════════════════════════════════════════════

/**
 * Create the CM6 StateField that manages all KCL decorations.
 *
 * Exported as createDecorationPlugin for API compatibility with main.ts,
 * but internally returns a StateField (not a ViewPlugin).
 */
export function createDecorationPlugin(plugin: any) {
  return StateField.define<DecorationSet>({
    create(state: EditorState): DecorationSet {
      return buildDecorationsFromState(state, plugin);
    },

    update(decorations: DecorationSet, tr: Transaction): DecorationSet {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CRITICAL FIX (same as v1 fix, but now in StateField):
      // Selection-only changes must NOT rebuild decorations.
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (!tr.docChanged) {
        return decorations;
      }

      // Adjust positions of all existing decorations through the change
      decorations = decorations.map(tr.changes);

      // Collect line numbers that were affected by the change
      const doc = tr.state.doc;
      const changedLines = new Set<number>();

      tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
        const lo = doc.lineAt(fromB).number;
        const hi = doc.lineAt(Math.min(toB, doc.length)).number;
        for (let n = lo; n <= hi; n++) changedLines.add(n);
      });

      if (changedLines.size === 0) return decorations;

      // Remove stale decorations on changed lines
      for (const n of changedLines) {
        const line = doc.line(n);
        decorations = decorations.update({
          filterFrom: line.from,
          filterTo: line.to,
          filter: () => false,
        });
      }

      // Add fresh decorations for changed lines
      const additions: { pos: number; deco: Decoration }[] = [];

      for (const n of changedLines) {
        const line = doc.line(n);
        const triggers = detectTriggers(line.text, line.from);

        for (const trigger of triggers) {
          const widget = createWidget(plugin, trigger);
          const block = isBlockWidget(trigger);
          const pos = trigger.mathRange ? trigger.mathRange.to : trigger.to;

          additions.push({
            pos,
            deco: Decoration.widget({ widget, side: 1, block }),
          });
        }
      }

      if (additions.length > 0) {
        additions.sort((a, b) => a.pos - b.pos);
        decorations = decorations.update({
          add: additions.map(({ pos, deco }) => deco.range(pos)),
        });
      }

      return decorations;
    },

    provide(f) {
      // EditorView.decorations.from() is the only way to supply block widgets.
      return EditorView.decorations.from(f);
    },
  });
}
