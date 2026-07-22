import { EditorView } from "@codemirror/view";
import { ChangeSet } from "@codemirror/state";
import { tabstopSpecsToTabstopGroups, TabstopGroup } from "./tabstop";
import { addTabstops, tabstopsStateField } from "./codemirror/tabstops_state_field";
import { clearSnippetQueue, getSnippetQueue } from "./codemirror/snippet_queue_state_field";
import { SnippetChangeSpec } from "./codemirror/snippet_change_spec";

export function expandSnippets(view: EditorView): boolean {
  const queue = getSnippetQueue(view);
  const snippetsToExpand = queue.snippetQueueValue;
  if (snippetsToExpand.length === 0) return false;

  const snippetChangeSpecs = snippetsToExpand.map((s) => s.toChangeSpec());
  const finalChanges = ChangeSet.of(snippetChangeSpecs, view.state.doc.length);

  const rawTabstops = snippetsToExpand.flatMap((s) => s.getTabstops());
  const tabstopGroups = tabstopSpecsToTabstopGroups(rawTabstops);

  const selection = view.state.selection.map(finalChanges, 1);

  view.dispatch({
    changes: finalChanges,
    selection: selection,
    userEvent: "input.type",
    scrollIntoView: true,
  });

  if (tabstopGroups.length > 0) {
    addTabstops(view, tabstopGroups);
  }

  clearSnippetQueue(view);

  // Focus initial tabstop if available
  if (tabstopGroups.length > 0) {
    const firstGroup = tabstopGroups[0];
    if (firstGroup.ranges.length > 0) {
      const range = firstGroup.ranges[0];
      view.dispatch({
        selection: { anchor: range.from, head: range.to },
        scrollIntoView: true,
      });
    }
  }

  return true;
}
