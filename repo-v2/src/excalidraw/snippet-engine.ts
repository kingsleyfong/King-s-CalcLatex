import type { SnippetDef, MathMode } from "./types";
import { detectMathMode, isWordDelimiter, resolveVisualPlaceholder } from "./snippet-parser";
import { TabstopManager, parseTabstops } from "./tabstop-manager";
import { TextareaSurface, type TextSurface } from "./text-surface";

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
  private surface: TextSurface | null = null;
  private inputTarget: HTMLElement | null = null;
  private keydownTarget: HTMLElement | null = null;
  /** When keydownTarget is a broad ancestor (e.g. document.documentElement, to outrace a
   *  host app's own focus-trap), gate keydown processing to events whose target is actually
   *  inside this element -- otherwise every keystroke anywhere in the app would be read as
   *  if it happened in our surface. Unused (null) for the normal same-element/near-ancestor case. */
  private focusScope: HTMLElement | null = null;
  private wordDelimiters = DEFAULT_WORD_DELIMITERS;
  /** When set, bypasses $-delimiter scanning and treats the whole surface as this mode
   *  (e.g. the "Edit LaTeX" modal's buffer is raw LaTeX with no delimiters to scan). */
  private forcedMode: MathMode | null = null;
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
  /**
   * Tracks the buffer as of the last time WE looked at or wrote it, so the next keystroke
   * can be diffed against it to find exactly what the user typed (position, chars removed,
   * chars inserted). Needed to keep TabstopManager's stored tabstop positions accurate as
   * the user types INSIDE an earlier tabstop (e.g. typing "10" into "^{|}" after an
   * exponent snippet expands) -- without this, a later tabstop's `from`/`to` stays at its
   * pre-edit position, so Tab jumps to the wrong (stale) place. Kept in sync at every
   * point WE write the buffer too (updateTextareaPrivate), so the diff always reflects
   * only the user's own edits, never our own snippet-expansion rewrites (those already
   * call tabstopMgr.setTabstops with correct fresh positions and must not ALSO be run
   * through adjustForEdit on top of that).
   */
  private lastKnownText: string | null = null;

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
    this.attachSurface(new TextareaSurface(textarea), textarea);
  }

  /**
   * Same engine, driven by any TextSurface (e.g. a CM6Surface wrapping a real EditorView).
   *
   * `inputTarget` and `keydownTarget` are deliberately independent: `input` must be read
   * AFTER the underlying editor (CM6) has finished applying the keystroke to its own state
   * -- listening on an ancestor with capture=true would fire DURING the capture descent,
   * before the event even reaches the real target, reading a stale buffer. `keydown`
   * (Tab/Backspace/auto-fraction interception via preventDefault) needs the opposite: it
   * must win the race against the editor's OWN keydown handling, which capture-on-an-
   * ancestor guarantees regardless of listener registration order. For a plain textarea
   * there's no competing internal editor, so both default to the same element.
   *
   * Only listen for "input", never add a "keyup" fallback: a second call per keystroke
   * double-processes auto-expand, and for bracket-pair snippets (e.g. "_" -> "_{$0}$1")
   * the cursor lands adjacent to the just-inserted "{", so the redundant call re-matches
   * the same trailing "{" and re-expands -- confirmed live to cascade into a runaway
   * loop of closing braces on every subsequent keystroke.
   */
  attachSurface(
    surface: TextSurface,
    inputTarget: HTMLElement,
    keydownTarget: HTMLElement = inputTarget,
    focusScope: HTMLElement | null = null,
  ): void {
    console.log("[KCL-DEBUG] SnippetEngine.attach, snippet count:", this.snippets.length);
    this.detach();
    this.surface = surface;
    this.inputTarget = inputTarget;
    this.keydownTarget = keydownTarget;
    this.focusScope = focusScope;
    this.lastKnownText = surface.getValue();

    this.handleInput = (e: Event) => this.onInput(e as InputEvent);
    this.handleKeydown = (e: Event) => this.onKeydown(e as KeyboardEvent);

    inputTarget.addEventListener("input", this.handleInput, true);
    keydownTarget.addEventListener("keydown", this.handleKeydown, true);
  }

  /** Force mode detection to always report `mode` instead of scanning for $ delimiters. */
  setForcedMode(mode: MathMode | null): void {
    this.forcedMode = mode;
  }

  detach(): void {
    if (this.inputTarget && this.handleInput) {
      this.inputTarget.removeEventListener("input", this.handleInput, true);
    }
    if (this.keydownTarget && this.handleKeydown) {
      this.keydownTarget.removeEventListener("keydown", this.handleKeydown, true);
    }
    this.surface = null;
    this.inputTarget = null;
    this.keydownTarget = null;
    this.focusScope = null;
    this.lastKnownText = null;
    this.handleInput = null;
    this.handleKeydown = null;
    this.tabstopMgr.clear();
  }

  private onInput(_e: InputEvent): void {
    // Must check isExpanding SYNCHRONOUSLY, before scheduling the microtask below.
    // updateTextareaPrivate's textarea path (updateTextarea in interceptor.ts)
    // synchronously re-dispatches a native "input" event as part of setValue, which
    // re-enters this handler WHILE isExpanding is still true. If that check were
    // deferred into processInput() along with everything else, the re-entrant call's
    // deferred check would run after isExpanding has already been reset to false,
    // so it would proceed instead of bailing out -- re-matching the just-inserted
    // "{" of a bracket-pair snippet (e.g. "_" -> "_{$0}$1") and cascading into a
    // runaway "}}}}" loop, identical in symptom to the modal bug below but on canvas.
    // Confirmed by tracing updateTextarea's synchronous dispatchEvent call.
    if (this.isExpanding) {
      console.log("[KCL-DEBUG] onInput: skipped (sync), isExpanding=true");
      return;
    }

    // Defer the actual read to a microtask. For a CM6Surface, the underlying EditorView
    // reconciles native contenteditable edits via a MutationObserver, which runs as a
    // microtask AFTER the "input" event has already fired -- reading `surface.getValue()`
    // synchronously here sees the PREVIOUS keystroke's state, one keystroke stale.
    // Confirmed live: this silently corrupted every match in the "Edit LaTeX" modal
    // and cascaded into a runaway loop for bracket-pair snippets (cursor lands next
    // to a "{" the match never actually saw get typed past). A plain <textarea>'s
    // `.value` is already synchronously current, so this defer is a no-op for it, and
    // CM6Surface.setValue (editorView.dispatch) never emits a native "input" event, so
    // isExpanding can't be wrongly true when the CM6 path's own deferred read runs.
    queueMicrotask(() => this.processInput());
  }

  private processInput(): void {
    if (!this.surface) return;
    if (this.isExpanding) {
      console.log("[KCL-DEBUG] onInput: skipped, isExpanding=true");
      return;
    }

    const text = this.surface.getValue();
    const cursor = this.surface.getSelectionStart() || 0;

    // Keep TabstopManager's stored positions accurate as the user types INSIDE an earlier
    // tabstop (e.g. "10" typed into "^{|}" after an exponent snippet expands) -- see
    // lastKnownText's field comment for why this must run BEFORE tryAutoExpand (which may
    // call applyExpansion -> setTabstops, replacing the tabstop set outright; that fresh
    // set must not then ALSO be shifted by this same edit's delta).
    if (this.tabstopMgr.isActive() && this.lastKnownText !== null) {
      const delta = this.computeEditDelta(this.lastKnownText, text);
      if (delta) {
        this.tabstopMgr.adjustForEdit(delta.from, delta.oldLen, delta.newLen);
      }
    }
    this.lastKnownText = text;

    const mode = this.forcedMode ?? detectMathMode(text, cursor);
    console.log("[KCL-DEBUG] onInput: text=", JSON.stringify(text), "cursor=", cursor, "mode=", mode);

    const expanded = this.tryAutoExpand(text, cursor, mode);
    console.log("[KCL-DEBUG] onInput: tryAutoExpand result=", expanded, "textarea.value now=", JSON.stringify(this.surface.getValue()));
  }

  /**
   * Finds the single contiguous edit between two buffer snapshots via common-prefix/
   * common-suffix trimming -- accurate for the overwhelming majority of real keystrokes
   * (a single character typed/deleted, or a small contiguous replacement), which is the
   * only case this needs to handle: it runs once per "input" event, i.e. once per actual
   * edit, not as a general-purpose multi-edit differ.
   */
  private computeEditDelta(
    oldText: string,
    newText: string,
  ): { from: number; oldLen: number; newLen: number } | null {
    if (oldText === newText) return null;

    const maxPrefix = Math.min(oldText.length, newText.length);
    let start = 0;
    while (start < maxPrefix && oldText[start] === newText[start]) start++;

    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    return { from: start, oldLen: oldEnd - start, newLen: newEnd - start };
  }

  private onKeydown(e: KeyboardEvent): void {
    if (!this.surface) return;
    if (this.focusScope && !this.focusScope.contains(e.target as Node)) return;

    const text = this.surface.getValue();
    const cursor = this.surface.getSelectionStart() || 0;
    const mode = this.forcedMode ?? detectMathMode(text, cursor);
    console.log("[KCL-DEBUG] onKeydown: key=", e.key, "text=", JSON.stringify(text), "cursor=", cursor, "lastExpansion=", JSON.stringify(this.lastExpansion));

    if (e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (this.lastExpansion) {
        const currentStart = this.surface.getSelectionStart();
        const currentEnd = this.surface.getSelectionEnd();
        console.log("[KCL-DEBUG] onKeydown Backspace: currentStart=", currentStart, "currentEnd=", currentEnd, "matches afterText=", this.surface.getValue() === this.lastExpansion.afterText, "matches afterStart=", currentStart === this.lastExpansion.afterStart, "matches afterEnd=", currentEnd === this.lastExpansion.afterEnd);

        if (
          this.surface.getValue() === this.lastExpansion.afterText &&
          currentStart === this.lastExpansion.afterStart &&
          currentEnd === this.lastExpansion.afterEnd
        ) {
          console.log("[KCL-DEBUG] onKeydown Backspace: UNDO branch firing, reverting to beforeText=", JSON.stringify(this.lastExpansion.beforeText));
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

    const selectionStart = this.surface.getSelectionStart();
    const selectionEnd = this.surface.getSelectionEnd();
    if (selectionStart !== selectionEnd) {
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
          this.updateTextareaPrivate(this.surface.getValue(), ts.from, ts.to);
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
    if (!this.surface) return;
    console.log("[KCL-DEBUG] applyExpansion called: triggerStart=", triggerStart, "triggerEnd=", triggerEnd, "replacement=", JSON.stringify(replacement), "fullText=", JSON.stringify(fullText));

    const beforeText = fullText;
    const beforeStart = this.surface.getSelectionStart() || 0;
    const beforeEnd = this.surface.getSelectionEnd() || 0;

    const resolvedReplacement = resolveVisualPlaceholder(replacement, selectedText);
    const { text: expandedText, tabstops } = parseTabstops(
      resolvedReplacement,
      triggerStart,
    );
    const newText =
      fullText.slice(0, triggerStart) + expandedText + fullText.slice(triggerEnd);
    console.log("[KCL-DEBUG] applyExpansion: expandedText=", JSON.stringify(expandedText), "newText=", JSON.stringify(newText), "tabstops=", tabstops.length);

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

    console.log("[KCL-DEBUG] applyExpansion: after updateTextareaPrivate, textarea.value=", JSON.stringify(this.surface.getValue()));

    // Check again on the next microtask/macrotask in case Excalidraw's own React
    // re-render (triggered by the "input" event we just dispatched) overwrites our
    // change asynchronously.
    window.setTimeout(() => {
      console.log("[KCL-DEBUG] applyExpansion: textarea.value 50ms later=", JSON.stringify(this.surface?.getValue()));
    }, 50);

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
    if (!this.surface) return false;
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
      // "$" is always a math-mode delimiter, never legitimate numerator content --
      // unlike upstream LaTeX Suite (which only ever sees text already stripped of its
      // surrounding $ by CM6 syntax-tree math bounds), this engine's canvas surface
      // operates on the raw buffer with the delimiters still literally present. Without
      // this, typing "/" right after "$1$" pulls the opening "$" into the numerator
      // ("$1"), which then collides with parseTabstops' own "$<digit>" tabstop syntax
      // when that numerator text is spliced into the \frac{...}{$0}$1 template -- the
      // "$1" gets silently consumed as a fake tabstop instead of literal text, deleting
      // both the "$" and the numerator digit. Confirmed live: "$1$" + "/" produced
      // "\frac{}{}$" (numerator empty, leading "$" gone) instead of "\frac{1}{}$".
      if (depth === 0 && ch === "$") {
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
    if (!this.surface) return false;
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
    if (!this.surface) return;
    try {
      this.isExpanding = true;
      this.surface.setValue(value, selectionStart, selectionEnd);
    } finally {
      this.isExpanding = false;
    }
    // Every write WE make funnels through here (expansion, tabstop jump, tabout, undo) --
    // sync lastKnownText immediately so the next real keystroke's diff (processInput)
    // reflects only the user's own edit, never gets confused by comparing against a
    // pre-write snapshot.
    this.lastKnownText = value;
  }

  private insertAtCursor(insert: string): void {
    if (!this.surface) return;
    const text = this.surface.getValue();
    const cursor = this.surface.getSelectionStart() || 0;
    const newText = text.slice(0, cursor) + insert + text.slice(cursor);
    const newCursor = cursor + insert.length;
    this.updateTextareaPrivate(newText, newCursor, newCursor);
  }
}
