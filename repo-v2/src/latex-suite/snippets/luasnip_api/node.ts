import { VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER } from "../snippets";
import { TabstopSpec } from "../tabstop";

type Captures = { match: string[]; groups: Record<string, string> };

export type Options = {
  captures: Captures;
};
export const emptyInsertOptions: Options = {
  captures: { match: [], groups: {} },
};

export type ResultInsert = {
  insert: string;
  tabstops: readonly TabstopSpec[];
};

export class BaseNode {
  constructor(
    public insert: string | ((context: Options) => string | BaseNode[]),
    public tabstops: readonly TabstopSpec[] = [],
  ) {}

  applyInsert(options: Options): ResultInsert {
    if (typeof this.insert === "string") {
      return { insert: this.insert, tabstops: this.tabstops };
    }
    const result = this.insert(options);
    if (typeof result === "string") {
      return { insert: result, tabstops: this.tabstops };
    }

    let offset = 0;
    const tabstopResults = result
      .map((node) => node.applyInsert(options))
      .map(({ insert, tabstops }) => {
        const currentOffset = offset;
        offset += insert.length;
        return {
          insert,
          tabstops: [
            ...tabstops.map((ts) => ({
              ...ts,
              from: ts.from + currentOffset,
              to: ts.to + currentOffset,
            })),
            ...this.tabstops.map((ts) => ({
              ...ts,
              from: ts.from + currentOffset,
              to: ts.to + currentOffset,
            })),
          ],
        };
      });
    const insert = tabstopResults.map((r) => r.insert).join("");
    const tabstops = tabstopResults.flatMap((r) => r.tabstops);
    return { insert, tabstops };
  }
}

export class TextNode extends BaseNode {
  constructor(text: string) {
    super(text);
  }
}

export class TabstopNode extends BaseNode {
  constructor(index: number, insert: string = "") {
    super(insert, [{ index: [index], from: 0, to: insert.length }]);
  }
}

export class ArrayNode extends BaseNode {
  constructor(public nodes: BaseNode[]) {
    super((options) => nodes);
  }
}

export class SnippetTabstopOnlyNode extends ArrayNode {
  constructor(rawSnippetText: string) {
    super(parseSnippetTextToNodes(rawSnippetText));
  }
}

function parseSnippetTextToNodes(text: string): BaseNode[] {
  const nodes: BaseNode[] = [];
  let remaining = text;

  // Simple parser matching $0, $1, ${0:placeholder}, ${1:placeholder}
  const regex = /\$(?:(\d+)|{([^}:]+):([^}]+)})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(new TextNode(text.slice(lastIndex, match.index)));
    }

    if (match[1] !== undefined) {
      const idx = parseInt(match[1], 10);
      nodes.push(new TabstopNode(idx, ""));
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const idx = parseInt(match[2], 10);
      const placeholder = match[3];
      nodes.push(new TabstopNode(idx, placeholder));
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(new TextNode(text.slice(lastIndex)));
  }

  return nodes;
}
