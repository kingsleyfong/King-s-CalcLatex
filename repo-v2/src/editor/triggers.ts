/**
 * King's CalcLatex v2 — Trigger Detection
 *
 * Scans document lines for evaluation / plot / persist / convert triggers
 * inside math delimiters ($...$ and $$...$$).
 */

import type { TriggerMatch, TriggerKind } from "../types";

// ══════════════════════════════════════════════════════════════
//  TRIGGER PATTERNS
// ══════════════════════════════════════════════════════════════

interface TriggerDef {
  /** Regex applied to the content INSIDE math delimiters */
  pattern: RegExp;
  kind: TriggerKind;
  mode: string;
  /** If the trigger captures a trailing argument (e.g., @convert ft) */
  captureArg?: boolean;
}

const TRIGGER_DEFS: TriggerDef[] = [
  // Evaluation triggers — must appear at the very end of the math content
  { pattern: /\\approx\s*$/, kind: "evaluate", mode: "approximate" },
  { pattern: /\\equiv\s*$/,  kind: "evaluate", mode: "simplify" },
  // Plain = must come AFTER the escaped-command variants to avoid false matches.
  // Require = at the end that is NOT preceded by another = or \ or ! or < or >
  { pattern: /(?<![=\\!<>])=\s*$/, kind: "evaluate", mode: "exact" },

  // CAS triggers — symbolic computation with inline result display
  { pattern: /@diff\s*$/,    kind: "evaluate", mode: "differentiate" },
  { pattern: /@int\s*$/,     kind: "evaluate", mode: "integrate" },
  { pattern: /@solve\s*$/,   kind: "evaluate", mode: "solve" },
  { pattern: /@factor\s*$/,  kind: "evaluate", mode: "factor" },
  { pattern: /@px\s*$/,      kind: "evaluate", mode: "partial_x" },
  { pattern: /@py\s*$/,      kind: "evaluate", mode: "partial_y" },
  { pattern: /@pz\s*$/,      kind: "evaluate", mode: "partial_z" },
  { pattern: /@grad\s*$/,     kind: "evaluate", mode: "gradient" },
  { pattern: /@normal\s*$/,   kind: "evaluate", mode: "normal" },
  { pattern: /@limit\s*$/,    kind: "evaluate", mode: "limit" },
  { pattern: /@taylor\s*$/,   kind: "evaluate", mode: "taylor" },
  { pattern: /@partfrac\s*$/, kind: "evaluate", mode: "partfrac" },
  { pattern: /@expand\s*$/,   kind: "evaluate", mode: "expand" },

  // Plot triggers
  { pattern: /@plot3d\s*$/,    kind: "plot", mode: "plot3d" },
  { pattern: /@plot2d\s*$/,    kind: "plot", mode: "plot2d" },
  { pattern: /@geom\s*$/,      kind: "plot", mode: "geometry" },
  { pattern: /@contour\s*$/,   kind: "plot", mode: "contour" },
  { pattern: /@vecfield(?:\s+(\d+(?:\.\d+)?))?\s*$/, kind: "plot", mode: "vecfield", captureArg: true },
  { pattern: /@gradient\s*$/,  kind: "plot", mode: "gradient" },
  { pattern: /@tangent\s*$/,   kind: "plot", mode: "tangent" },
  { pattern: /@region\s*$/,    kind: "plot", mode: "region" },

  // Persist trigger
  { pattern: /@persist\s*$/, kind: "persist", mode: "persist" },

  // Convert trigger — captures the target unit after @convert
  { pattern: /@convert\s+(\S+)\s*$/, kind: "convert", mode: "convert", captureArg: true },
];

// ══════════════════════════════════════════════════════════════
//  MATH BLOCK SCANNER
// ══════════════════════════════════════════════════════════════

interface MathBlock {
  /** Content between the delimiters (excluding delimiters) */
  content: string;
  /** Absolute doc position of the content start */
  contentFrom: number;
  /** Absolute doc position of the content end */
  contentTo: number;
  /** Absolute doc positions of the full delimited block (including $ / $$) */
  blockFrom: number;
  blockTo: number;
  /** Whether this is a display math block ($$) */
  display: boolean;
}

/**
 * Find all $...$ and $$...$$ blocks on a single line.
 * We avoid regex-only approaches because nested/escaped dollars
 * are tricky. Instead we walk character by character.
 */
function findMathBlocks(lineText: string, lineFrom: number): MathBlock[] {
  const blocks: MathBlock[] = [];
  let i = 0;

  while (i < lineText.length) {
    if (lineText[i] === "$") {
      // Check for escaped dollar
      if (i > 0 && lineText[i - 1] === "\\") {
        i++;
        continue;
      }

      const display = lineText[i + 1] === "$";
      const delimLen = display ? 2 : 1;
      const contentStart = i + delimLen;

      // Find the matching closing delimiter
      let j = contentStart;
      let found = false;
      while (j < lineText.length) {
        if (lineText[j] === "$" && lineText[j - 1] !== "\\") {
          if (display) {
            // Need $$
            if (lineText[j + 1] === "$") {
              blocks.push({
                content: lineText.slice(contentStart, j),
                contentFrom: lineFrom + contentStart,
                contentTo: lineFrom + j,
                blockFrom: lineFrom + i,
                blockTo: lineFrom + j + 2,
                display: true,
              });
              i = j + 2;
              found = true;
              break;
            }
            // Single $ inside $$...$$  is just content — keep going
            j++;
          } else {
            blocks.push({
              content: lineText.slice(contentStart, j),
              contentFrom: lineFrom + contentStart,
              contentTo: lineFrom + j,
              blockFrom: lineFrom + i,
              blockTo: lineFrom + j + 1,
              display: false,
            });
            i = j + 1;
            found = true;
            break;
          }
        } else {
          j++;
        }
      }
      if (!found) {
        // Unclosed delimiter — skip past the opening
        i += delimLen;
      }
    } else {
      i++;
    }
  }

  return blocks;
}

// ══════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Detect all triggers in a single line of text.
 *
 * @param lineText  The full text content of the line
 * @param lineFrom  The absolute document offset where this line starts
 * @returns         Array of TriggerMatch objects (may be empty)
 */
export function detectTriggers(lineText: string, lineFrom: number): TriggerMatch[] {
  const blocks = findMathBlocks(lineText, lineFrom);
  const matches: TriggerMatch[] = [];

  for (const block of blocks) {
    const content = block.content;

    for (const def of TRIGGER_DEFS) {
      const m = def.pattern.exec(content);
      if (!m) continue;

      // The LaTeX expression is everything before the trigger match
      let latex = content.slice(0, m.index).trim();

      // For convert triggers, append the target unit to the mode
      let mode = def.mode;
      if (def.captureArg && m[1]) {
        mode = `${def.mode}:${m[1]}`;
      }

      // Compute absolute positions of the trigger within the document
      const triggerFrom = block.contentFrom + m.index;
      const triggerTo = block.contentFrom + m.index + m[0].length;

      matches.push({
        kind: def.kind,
        latex,
        mode,
        from: triggerFrom,
        to: triggerTo,
        mathRange: { from: block.blockFrom, to: block.blockTo },
      });

      // One trigger per math block — break after first match
      break;
    }
  }

  return matches;
}

/**
 * Strip math delimiters from a string.
 * Handles: $...$, $$...$$, \(...\), \[...\]
 */
export function stripMathDelimiters(text: string): string {
  let s = text.trim();

  // $$...$$
  if (s.startsWith("$$") && s.endsWith("$$") && s.length >= 4) {
    return s.slice(2, -2).trim();
  }
  // $...$
  if (s.startsWith("$") && s.endsWith("$") && s.length >= 2) {
    return s.slice(1, -1).trim();
  }
  // \[...\]
  if (s.startsWith("\\[") && s.endsWith("\\]")) {
    return s.slice(2, -2).trim();
  }
  // \(...\)
  if (s.startsWith("\\(") && s.endsWith("\\)")) {
    return s.slice(2, -2).trim();
  }

  return s;
}
