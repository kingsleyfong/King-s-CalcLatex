import type { SnippetDef, MathMode } from "./types";
import { detectMathMode, isWordDelimiter, resolveVisualPlaceholder } from "./snippet-parser";
import { TabstopManager, parseTabstops } from "./tabstop-manager";
import { updateTextarea } from "./interceptor";

const DEFAULT_WORD_DELIMITERS = "., +-\n\t:;!?\\/{}[]()=~$'\"|`<>*^%#@&";

export class SnippetEngine {
  private snippets: SnippetDef[] = [
    {
      trigger: "mk",
      replacement: "$$0$",
      options: "tA",
      flags: {
        math: false,
        text: true,
        display: false,
        auto: true,
        regex: false,
        word: true,
        visual: false,
      },
    },
  ];
  private tabstopMgr = new TabstopManager();
  private textarea: HTMLTextAreaElement | HTMLInputElement | null = null;
  private wordDelimiters = DEFAULT_WORD_DELIMITERS;
  private lastExpansion: {
    beforeText: string;
    beforeStart: number;
    beforeEnd: number;
    afterText: string;
    afterStart: number;
    afterEnd: number;
  } | null = null;

  private handleInput: ((e: Event) => void) | null = null;
  private handleKeydown: ((e: Event) => void) | null = null;
  private isExpanding = false;

  private autofractionEnabled = true;
  private autofractionSymbol = "\\frac";
  private autofractionBreakingChars = "+-=\t";
  private autofractionExcludedEnvs: [string, string][] = [
    ["^{", "}"],
    ["\\pu{", "}"],
  ];

  private taboutEnabled = true;
  private taboutSymbols: string[] = [];

  private matrixEnabled = true;
  private matrixEnvNames: string[] = ["matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix"];

  setSnippets(snippets: SnippetDef[]): void {
    const builtin: SnippetDef[] = [
      {
        trigger: "mk",
        replacement: "$$0$",
        options: "tA",
        flags: {
          math: false,
          text: true,
          display: false,
          auto: true,
          regex: false,
          word: true,
          visual: false,
        },
      },
    ];
    const allSnippets = [...builtin, ...snippets];
    this.snippets = allSnippets.sort((a, b) => {
      const pA = a.priority ?? 0;
      const pB = b.priority ?? 0;
      if (pA !== pB) return pB - pA;
      const lenA = typeof a.trigger === "string" ? a.trigger.length : 0;
      const lenB = typeof b.trigger === "string" ? b.trigger.length : 0;
      return lenB - lenA;
    });
  }

  attach(textarea: HTMLTextAreaElement | HTMLInputElement): void {
    this.detach();
    this.textarea = textarea;

    this.handleInput = (e: Event) => this.onInput(e as InputEvent);
    this.handleKeydown = (e: Event) => this.onKeydown(e as KeyboardEvent);

    textarea.addEventListener("input", this.handleInput, true);
    textarea.addEventListener("keydown", this.handleKeydown, true);
  }

  detach(): void {
    if (this.textarea) {
      if (this.handleInput) {
        this.textarea.removeEventListener("input", this.handleInput, true);
      }
      if (this.handleKeydown) {
        this.textarea.removeEventListener("keydown", this.handleKeydown, true);
      }
    }
    this.textarea = null;
    this.handleInput = null;
    this.handleKeydown = null;
    this.tabstopMgr.clear();
  }

  private onInput(_e: InputEvent): void {
    if (!this.textarea) return;
    if (this.isExpanding) return;

    const text = this.textarea.value;
    const cursor = this.textarea.selectionStart || 0;
    const mode = detectMathMode(text, cursor);

    this.tryAutoExpand(text, cursor, mode);
  }

  private onKeydown(e: KeyboardEvent): void {
    if (!this.textarea) return;

    const text = this.textarea.value;
    const cursor = this.textarea.selectionStart || 0;
    const mode = detectMathMode(text, cursor);

    if (e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (this.lastExpansion) {
        const currentStart = this.textarea.selectionStart;
        const currentEnd = this.textarea.selectionEnd;

        if (
          this.textarea.value === this.lastExpansion.afterText &&
          currentStart === this.lastExpansion.afterStart &&
          currentEnd === this.lastExpansion.afterEnd
        ) {
          e.preventDefault();
          e.stopPropagation();

          this.updateTextareaPrivate(
            this.lastExpansion.beforeText,
            this.lastExpansion.beforeStart,
            this.lastExpansion.beforeEnd,
          );

          this.lastExpansion = null;
          this.tabstopMgr.clear();
          return;
        }
      }
    }

    if (e.key !== "Backspace") {
      this.lastExpansion = null;
    }

    const selectionStart = this.textarea.selectionStart;
    const selectionEnd = this.textarea.selectionEnd;
    if (
      selectionStart !== null &&
      selectionEnd !== null &&
      selectionStart !== selectionEnd
    ) {
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const char = e.key;
        const selectedText = text.slice(selectionStart, selectionEnd);
        const selectionMode = detectMathMode(text, selectionStart);

        for (const snippet of this.snippets) {
          if (!snippet.flags?.visual) continue;
          if (!this.modeMatches(snippet, selectionMode)) continue;

          let isMatch = false;
          if (typeof snippet.trigger === "string" && snippet.trigger === char) {
            isMatch = true;
          } else if (snippet.trigger instanceof RegExp) {
            isMatch = snippet.trigger.test(char);
          }

          if (isMatch) {
            e.preventDefault();
            e.stopPropagation();
            this.applyExpansion(
              selectionStart,
              selectionEnd,
              snippet.replacement as string,
              text,
              selectedText,
            );
            return;
          }
        }
      }
    }

    if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const isShift = e.shiftKey;

      if (this.tabstopMgr.isActive()) {
        e.preventDefault();
        e.stopPropagation();
        const ts = isShift ? this.tabstopMgr.prev() : this.tabstopMgr.next();
        if (ts) {
          this.updateTextareaPrivate(this.textarea.value, ts.from, ts.to);
        }
        return;
      }

      if (!isShift) {
        if (this.matrixEnabled && mode !== "text" && this.isInMatrixEnv(text, cursor)) {
          e.preventDefault();
          e.stopPropagation();
          this.insertAtCursor(" & ");
          return;
        }

        const expansion = this.tryTabExpand(text, cursor, mode);
        if (expansion) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (this.taboutEnabled && this.tryTabout(text, cursor)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      if (this.matrixEnabled && mode !== "text" && this.isInMatrixEnv(text, cursor)) {
        e.preventDefault();
        e.stopPropagation();
        this.insertAtCursor(" \\\\\n");
        return;
      }
    }

    if (e.key === "/" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (this.autofractionEnabled && mode !== "text") {
        if (this.tryAutoFraction(text, cursor)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }
  }

  private tryAutoExpand(text: string, cursor: number, mode: MathMode): boolean {
    const textBefore = text.slice(0, cursor);

    for (const snippet of this.snippets) {
      if (!snippet.flags?.auto) continue;
      if (snippet.flags?.visual) continue;
      if (!this.modeMatches(snippet, mode)) continue;

      const match = this.matchSnippet(snippet, textBefore);
      if (match) {
        this.applyExpansion(match.triggerStart, cursor, match.replacement, text);
        return true;
      }
    }
    return false;
  }

  private tryTabExpand(text: string, cursor: number, mode: MathMode): boolean {
    const textBefore = text.slice(0, cursor);

    for (const snippet of this.snippets) {
      if (snippet.flags?.auto) continue;
      if (snippet.flags?.visual) continue;
      if (!this.modeMatches(snippet, mode)) continue;

      const match = this.matchSnippet(snippet, textBefore);
      if (match) {
        this.applyExpansion(match.triggerStart, cursor, match.replacement, text);
        return true;
      }
    }
    return false;
  }

  private matchSnippet(
    snippet: SnippetDef,
    textBefore: string,
  ): { triggerStart: number; replacement: string } | null {
    if (snippet.flags?.regex && snippet.trigger instanceof RegExp) {
      return this.matchRegexSnippet(snippet, textBefore);
    }

    if (typeof snippet.trigger === "string") {
      return this.matchStringSnippet(snippet, textBefore);
    }

    if (snippet.trigger instanceof RegExp) {
      return this.matchRegexSnippet(snippet, textBefore);
    }

    return null;
  }

  private matchStringSnippet(
    snippet: SnippetDef,
    textBefore: string,
  ): { triggerStart: number; replacement: string } | null {
    const trigger = snippet.trigger as string;
    if (!textBefore.endsWith(trigger)) return null;

    const triggerStart = textBefore.length - trigger.length;

    if (snippet.flags?.word) {
      if (triggerStart > 0) {
        const charBefore = textBefore[triggerStart - 1];
        if (!isWordDelimiter(charBefore, this.wordDelimiters)) return null;
      }
    }

    const replacement =
      typeof snippet.replacement === "string" ? snippet.replacement : "";

    return { triggerStart, replacement };
  }

  private matchRegexSnippet(
    snippet: SnippetDef,
    textBefore: string,
  ): { triggerStart: number; replacement: string } | null {
    const regex = snippet.trigger as RegExp;
    const pattern = new RegExp(regex.source + "$", regex.flags.replace("g", ""));
    const match = pattern.exec(textBefore);
    if (!match) return null;

    const triggerStart = match.index;

    let replacement: string;
    if (typeof snippet.replacement === "function") {
      try {
        replacement = snippet.replacement(match as RegExpExecArray);
      } catch {
        return null;
      }
    } else {
      replacement = snippet.replacement as string;
      for (let i = 1; i < match.length; i++) {
        replacement = replacement.replaceAll(`[[${i - 1}]]`, match[i] || "");
      }
    }

    return { triggerStart, replacement };
  }

  private applyExpansion(
    triggerStart: number,
    triggerEnd: number,
    replacement: string,
    fullText: string,
    selectedText: string = "",
  ): void {
    if (!this.textarea) return;

    const beforeText = fullText;
    const beforeStart = this.textarea.selectionStart || 0;
    const beforeEnd = this.textarea.selectionEnd || 0;

    const resolvedReplacement = resolveVisualPlaceholder(replacement, selectedText);
    const { text: expandedText, tabstops } = parseTabstops(
      resolvedReplacement,
      triggerStart,
    );
    const newText =
      fullText.slice(0, triggerStart) + expandedText + fullText.slice(triggerEnd);

    let newCursorStart = triggerStart + expandedText.length;
    let newCursorEnd = newCursorStart;

    if (tabstops.length > 0) {
      this.tabstopMgr.setTabstops(tabstops);
      const first = this.tabstopMgr.next();
      if (first) {
        newCursorStart = first.from;
        newCursorEnd = first.to;
        this.updateTextareaPrivate(newText, first.from, first.to);
      } else {
        this.updateTextareaPrivate(newText, newCursorStart, newCursorStart);
      }
    } else {
      this.updateTextareaPrivate(newText, newCursorStart, newCursorStart);
    }

    this.lastExpansion = {
      beforeText,
      beforeStart,
      beforeEnd,
      afterText: newText,
      afterStart: newCursorStart,
      afterEnd: newCursorEnd,
    };
  }

  private tryAutoFraction(text: string, cursor: number): boolean {
    if (!this.textarea) return false;
    const textBefore = text.slice(0, cursor);

    for (const [open, close] of this.autofractionExcludedEnvs) {
      const lastOpen = textBefore.lastIndexOf(open);
      if (lastOpen >= 0) {
        const afterOpen = textBefore.slice(lastOpen + open.length);
        if (!afterOpen.includes(close)) {
          return false;
        }
      }
    }

    const numerator = this.findNumerator(textBefore);
    if (!numerator || numerator.text.length === 0) return false;

    const fracStr = `${this.autofractionSymbol}{${numerator.text}}{$0}$1`;
    const { text: expanded, tabstops } = parseTabstops(fracStr, numerator.start);

    const newText = text.slice(0, numerator.start) + expanded + text.slice(cursor);

    if (tabstops.length > 0) {
      this.tabstopMgr.setTabstops(tabstops);
      const first = this.tabstopMgr.next();
      if (first) {
        this.updateTextareaPrivate(newText, first.from, first.to);
      } else {
        const endPos = numerator.start + expanded.length;
        this.updateTextareaPrivate(newText, endPos, endPos);
      }
    } else {
      const endPos = numerator.start + expanded.length;
      this.updateTextareaPrivate(newText, endPos, endPos);
    }

    return true;
  }

  private findNumerator(textBefore: string): { text: string; start: number } | null {
    let i = textBefore.length - 1;
    let depth = 0;

    while (i >= 0) {
      const ch = textBefore[i];
      if (ch === ")" || ch === "]" || ch === "}") {
        depth++;
        i--;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        if (depth > 0) {
          depth--;
          i--;
          continue;
        }
        break;
      }
      if (depth === 0 && this.autofractionBreakingChars.includes(ch)) {
        break;
      }
      if (depth === 0 && /\s/.test(ch)) {
        break;
      }
      i--;
    }

    i++;
    const text = textBefore.slice(i).trim();
    if (text.length === 0) return null;

    return { text, start: i };
  }

  private tryTabout(text: string, cursor: number): boolean {
    if (!this.textarea) return false;
    if (cursor >= text.length) return false;

    const charAfter = text.slice(cursor);
    for (const sym of this.taboutSymbols) {
      if (charAfter.startsWith(sym)) {
        const newCursor = cursor + sym.length;
        this.updateTextareaPrivate(text, newCursor, newCursor);
        return true;
      }
    }

    const ch = text[cursor];
    if (ch === ")" || ch === "]" || ch === "}") {
      const newCursor = cursor + 1;
      this.updateTextareaPrivate(text, newCursor, newCursor);
      return true;
    }

    return false;
  }

  private isInMatrixEnv(text: string, cursor: number): boolean {
    const textBefore = text.slice(0, cursor);

    for (const envName of this.matrixEnvNames) {
      const openTag = `\\begin{${envName}}`;
      const closeTag = `\\end{${envName}}`;
      const lastOpen = textBefore.lastIndexOf(openTag);
      if (lastOpen < 0) continue;

      const afterOpen = textBefore.slice(lastOpen + openTag.length);
      const closeInBetween = afterOpen.lastIndexOf(closeTag);
      if (closeInBetween < 0) {
        return true;
      }
    }

    return false;
  }

  private modeMatches(snippet: SnippetDef, mode: MathMode): boolean {
    const f = snippet.flags;
    if (!f) return true;

    if (!f.math && !f.text && !f.display) return true;

    switch (mode) {
      case "text":
        return f.text;
      case "math":
        return f.math || f.display;
      case "display":
        return f.display || f.math;
    }
  }

  private updateTextareaPrivate(
    value: string,
    selectionStart: number,
    selectionEnd: number,
  ): void {
    if (!this.textarea) return;
    try {
      this.isExpanding = true;
      updateTextarea(this.textarea, value, selectionStart, selectionEnd);
    } finally {
      this.isExpanding = false;
    }
  }

  private insertAtCursor(insert: string): void {
    if (!this.textarea) return;
    const text = this.textarea.value;
    const cursor = this.textarea.selectionStart || 0;
    const newText = text.slice(0, cursor) + insert + text.slice(cursor);
    const newCursor = cursor + insert.length;
    this.updateTextareaPrivate(newText, newCursor, newCursor);
  }
}
