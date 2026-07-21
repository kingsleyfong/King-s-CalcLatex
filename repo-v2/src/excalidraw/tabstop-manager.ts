export interface Tabstop {
  index: number;
  from: number;
  to: number;
  placeholder: string;
}

export class TabstopManager {
  private tabstops: Tabstop[] = [];
  private currentIndex = -1;
  private active = false;

  setTabstops(tabstops: Tabstop[]): void {
    this.tabstops = tabstops.sort((a, b) => a.index - b.index);
    this.currentIndex = -1;
    this.active = tabstops.length > 0;
  }

  isActive(): boolean {
    return this.active;
  }

  next(): Tabstop | null {
    if (!this.active || this.tabstops.length === 0) return null;
    this.currentIndex++;
    if (this.currentIndex >= this.tabstops.length) {
      this.clear();
      return null;
    }
    return this.tabstops[this.currentIndex];
  }

  prev(): Tabstop | null {
    if (!this.active || this.currentIndex <= 0) return null;
    this.currentIndex--;
    return this.tabstops[this.currentIndex];
  }

  current(): Tabstop | null {
    if (!this.active || this.currentIndex < 0 || this.currentIndex >= this.tabstops.length) {
      return null;
    }
    return this.tabstops[this.currentIndex];
  }

  adjustForEdit(editFrom: number, oldLen: number, newLen: number): void {
    const delta = newLen - oldLen;
    for (const ts of this.tabstops) {
      if (ts.from >= editFrom + oldLen) {
        ts.from += delta;
        ts.to += delta;
      } else if (ts.from >= editFrom) {
        ts.to = ts.from + Math.max(0, ts.to - ts.from + delta);
      }
    }
  }

  clear(): void {
    this.tabstops = [];
    this.currentIndex = -1;
    this.active = false;
  }
}

export function parseTabstops(
  replacement: string,
  insertionOffset: number,
): { text: string; tabstops: Tabstop[] } {
  const tabstops: Tabstop[] = [];
  let result = "";
  let i = 0;

  while (i < replacement.length) {
    if (replacement[i] === "$") {
      const placeholderMatch = replacement.slice(i).match(/^\$\{(\d+):([^}]*)\}/);
      if (placeholderMatch) {
        const index = parseInt(placeholderMatch[1]);
        const placeholder = placeholderMatch[2];
        const from = insertionOffset + result.length;
        result += placeholder;
        const to = insertionOffset + result.length;
        tabstops.push({ index, from, to, placeholder });
        i += placeholderMatch[0].length;
        continue;
      }

      const simpleMatch = replacement.slice(i).match(/^\$(\d+)/);
      if (simpleMatch) {
        const index = parseInt(simpleMatch[1]);
        const pos = insertionOffset + result.length;
        tabstops.push({ index, from: pos, to: pos, placeholder: "" });
        i += simpleMatch[0].length;
        continue;
      }
    }

    result += replacement[i];
    i++;
  }

  return { text: result, tabstops };
}
