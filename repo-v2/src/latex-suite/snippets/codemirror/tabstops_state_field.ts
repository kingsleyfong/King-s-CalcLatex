import { EditorView, Decoration } from "@codemirror/view";
import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import { TabstopGroup } from "../tabstop";

export const addTabstopsEffect = StateEffect.define<TabstopGroup[]>();
export const removeAllTabstopsEffect = StateEffect.define();

type TabstopsState = {
  index: number;
  tabstopGroups: TabstopGroup[];
  color: number;
};

export const tabstopsStateField = StateField.define<TabstopsState>({
  create() {
    return {
      index: 0,
      tabstopGroups: [],
      color: 0,
    };
  },

  update(value, transaction) {
    let tabstopGroups = value.tabstopGroups;
    let color = value.color;

    tabstopGroups.forEach((grp) => {
      grp.ranges = grp.ranges.map((r) => ({
        from: transaction.changes.mapPos(r.from, 1),
        to: transaction.changes.mapPos(r.to, 1),
      }));
    });

    for (const effect of transaction.effects) {
      if (effect.is(addTabstopsEffect)) {
        tabstopGroups.splice(value.index, 0, ...effect.value);
      } else if (effect.is(removeAllTabstopsEffect)) {
        tabstopGroups = [];
        color = 0;
      }
    }

    return {
      index: value.index,
      tabstopGroups,
      color,
    };
  },
});

export function addTabstops(view: EditorView, tabstopGroups: TabstopGroup[]) {
  view.dispatch({
    effects: addTabstopsEffect.of(tabstopGroups),
  });
}

export function removeAllTabstops(view: EditorView) {
  view.dispatch({
    effects: removeAllTabstopsEffect.of(null),
  });
}
