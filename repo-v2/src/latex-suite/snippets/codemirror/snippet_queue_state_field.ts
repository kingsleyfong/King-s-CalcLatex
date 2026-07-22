import { EditorView, ViewPlugin } from "@codemirror/view";
import { SnippetChangeSpec } from "./snippet_change_spec";

export const snippetQueuePlugin = ViewPlugin.fromClass(
  class {
    private snippetQueue: SnippetChangeSpec[] = [];

    clearSnippetQueue() {
      this.snippetQueue = [];
    }

    QueueSnippets(values: SnippetChangeSpec[]) {
      this.snippetQueue = this.snippetQueue.concat(values);
    }

    get snippetQueueValue(): SnippetChangeSpec[] {
      return this.snippetQueue.map(
        (s) => new SnippetChangeSpec(s.from, s.to, s.insert, s.keyPressed, s.after),
      );
    }
  },
);

export function getSnippetQueue(view: EditorView) {
  const plugin = view.plugin(snippetQueuePlugin);
  if (!plugin) {
    throw new Error("snippetQueuePlugin is missing");
  }
  return plugin;
}

export function queueSnippets(view: EditorView, values: SnippetChangeSpec[]) {
  const queue = getSnippetQueue(view);
  queue.QueueSnippets(values);
}

export function clearSnippetQueue(view: EditorView) {
  const queue = getSnippetQueue(view);
  queue.clearSnippetQueue();
}
