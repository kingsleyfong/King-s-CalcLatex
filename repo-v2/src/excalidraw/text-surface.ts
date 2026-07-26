import { updateTextarea } from "./interceptor";

/**
 * Abstraction over "a place SnippetEngine can read/write text and a cursor
 * position" -- lets the same matching/tabstop/auto-fraction logic drive both
 * a plain Excalidraw canvas <textarea> and a real CodeMirror 6 EditorView
 * (e.g. the "Edit LaTeX" modal's editor), without duplicating the engine.
 */
export interface TextSurface {
  getValue(): string;
  getSelectionStart(): number;
  getSelectionEnd(): number;
  setValue(value: string, selectionStart: number, selectionEnd: number): void;
}

export class TextareaSurface implements TextSurface {
  constructor(private el: HTMLTextAreaElement | HTMLInputElement) {}

  getValue(): string {
    return this.el.value;
  }

  getSelectionStart(): number {
    return this.el.selectionStart ?? 0;
  }

  getSelectionEnd(): number {
    return this.el.selectionEnd ?? 0;
  }

  setValue(value: string, selectionStart: number, selectionEnd: number): void {
    updateTextarea(this.el, value, selectionStart, selectionEnd);
  }
}

/** `view` is Excalidraw's internal CM6 EditorView instance -- untyped like the rest of latex-modal.ts. */
export class CM6Surface implements TextSurface {
  constructor(private view: any) {}

  getValue(): string {
    return this.view.state.doc.toString();
  }

  getSelectionStart(): number {
    return this.view.state.selection.main.from;
  }

  getSelectionEnd(): number {
    return this.view.state.selection.main.to;
  }

  setValue(value: string, selectionStart: number, selectionEnd: number): void {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: value },
      selection: { anchor: selectionStart, head: selectionEnd },
    });
  }
}
