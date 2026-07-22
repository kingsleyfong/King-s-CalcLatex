import { ChangeSet, ChangeSpec } from "@codemirror/state";
import { TabstopSpec } from "../tabstop";
import { ResultInsert } from "../luasnip_api/node";

export class SnippetChangeSpec {
  constructor(
    public from: number,
    public to: number,
    public insert: ResultInsert,
    public keyPressed?: string,
    public after?: number,
  ) {}

  getTabstops(): TabstopSpec[] {
    return this.insert.tabstops.map((ts) => ({
      ...ts,
      from: ts.from + this.from,
      to: ts.to + this.from,
    }));
  }

  toChangeSpec(): ChangeSpec {
    return { from: this.from, to: this.to, insert: this.insert.insert };
  }

  applyChange(changes: ChangeSet): SnippetChangeSpec {
    return new SnippetChangeSpec(
      changes.mapPos(this.from, 1),
      changes.mapPos(this.to, 1),
      this.insert,
      this.keyPressed,
      this.after !== undefined ? changes.mapPos(this.after, 1) : undefined,
    );
  }
}
