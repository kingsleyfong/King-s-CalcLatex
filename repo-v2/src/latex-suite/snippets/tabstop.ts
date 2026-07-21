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

  // Sort: $1, $2, $3... and $0 last
  result.sort((a, b) => {
    if (a.index === 0) return 1;
    if (b.index === 0) return -1;
    return a.index - b.index;
  });

  return result;
}
