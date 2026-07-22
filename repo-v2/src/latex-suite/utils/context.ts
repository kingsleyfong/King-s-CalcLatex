import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

export class MathContextManager {
  static isMathMode(state: EditorState, pos: number): boolean {
    try {
      const tree = syntaxTree(state);
      let node: any = tree.resolveInner(pos, -1);
      while (node) {
        const name: string = node.name || "";
        if (
          name.includes("math") ||
          name.includes("formatting-math") ||
          name.includes("math-inline") ||
          name.includes("math-block") ||
          name.includes("HyperMD-mathblock") ||
          name.includes("katex") ||
          name.includes("Formula")
        ) {
          return true;
        }
        if (!node.parent) break;
        node = node.parent;
      }
    } catch {}

    // Fallback: Precise document-level dollar sign scanner
    const docStr = state.doc.toString();
    let inInline = false;
    let inDisplay = false;
    let i = 0;
    while (i < pos) {
      // Escaped \$ sign - skip both characters so literal \$ doesn't toggle math mode
      if (docStr[i] === "\\" && i + 1 < docStr.length && docStr[i + 1] === "$") {
        i += 2;
        continue;
      }
      if (docStr[i] === "$") {
        if (i + 1 < docStr.length && docStr[i + 1] === "$") {
          inDisplay = !inDisplay;
          i += 2;
          continue;
        } else if (!inDisplay) {
          inInline = !inInline;
          i += 1;
          continue;
        }
      }
      i++;
    }
    return inInline || inDisplay;
  }
}
