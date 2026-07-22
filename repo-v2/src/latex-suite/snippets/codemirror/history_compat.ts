import { EditorView } from "@codemirror/view";
import { Transaction } from "@codemirror/state";

export function historyCompat(view: EditorView, tr: Transaction): void {
  view.dispatch(tr);
}
