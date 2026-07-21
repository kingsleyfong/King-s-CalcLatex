export interface TabstopSpec {
  index: number[];
  from: number;
  to: number;
}

export class TabstopGroup {
  constructor(
    public index: number,
    public ranges: { from: number; to: number }[],
  ) {}
}

export function tabstopSpecsToTabstopGroups(specs: readonly TabstopSpec[]): TabstopGroup[] {
  const map = new Map<number, { from: number; to: number }[]>();

  for (const spec of specs) {
    for (const idx of spec.index) {
      if (!map.has(idx)) {
        map.set(idx, []);
      }
      map.get(idx)!.push({ from: spec.from, to: spec.to });
    }
  }

  const result: TabstopGroup[] = [];
  for (const [index, ranges] of map.entries()) {
    result.push(new TabstopGroup(index, ranges));
  }

  // In obsidian-latex-suite, tabstops are sorted in ascending numerical order ($0, $1, $2, $3...)
  result.sort((a, b) => a.index - b.index);

  return result;
}
