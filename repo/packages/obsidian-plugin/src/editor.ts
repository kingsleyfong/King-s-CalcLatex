import { EditorState, RangeSetBuilder, Prec, StateField, StateEffect } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
  keymap,
} from "@codemirror/view";
import type KingsCalcLatexPlugin from "./main";

type TriggerKind = "evaluate" | "plot" | "persist" | "convert";

interface TriggerMatch {
  kind: TriggerKind;
  latex: string;
  mode: string;
  fullMatch: string;
  from: number;
  to: number;
  mathRange: { from: number; to: number } | null;
}

// ── Utilities ──────────────────────────────────────────────────────

function detectTriggers(docText: string, from: number, to: number): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const segment = docText.slice(from, to);
  const pattern = /(=|\\approx|\\equiv|@plot2d|@plot3d|@geom|@persist|@convert\s+[A-Za-z°/]+)/g;
  
  // Robust non-greedy math block detection
  const mathBlocks: { start: number; end: number; content: string }[] = [];
  const mathRe = /\$\$?[\s\S]*?\$\$?/g;
  let mm;
  while ((mm = mathRe.exec(segment)) !== null) {
      mathBlocks.push({ start: mm.index, end: mm.index + mm[0].length, content: mm[0] });
  }

  let m;
  while ((m = pattern.exec(segment)) !== null) {
      const triggerText = m[1];
      const triggerIndex = m.index;
      
      let kind: TriggerKind = "evaluate";
      let mode = "exact";
      
      if (triggerText === "=") { kind = "evaluate"; mode = "exact"; }
      else if (triggerText === "\\approx") { kind = "evaluate"; mode = "approximate"; }
      else if (triggerText === "\\equiv") { kind = "evaluate"; mode = "simplify"; }
      else if (triggerText === "@plot2d") { kind = "plot"; mode = "plot2d"; }
      else if (triggerText === "@plot3d") { kind = "plot"; mode = "plot3d"; }
      else if (triggerText === "@geom") { kind = "plot"; mode = "geometry"; }
      else if (triggerText === "@persist") { kind = "persist"; mode = "persist"; }
      else if (triggerText.startsWith("@convert")) {
          kind = "convert";
          mode = triggerText.split(/\s+/)[1];
      }
      
      let latex = "";
      let mathRange = null;
      
      const block = mathBlocks.find(b => triggerIndex >= b.start && triggerIndex < b.end);
      if (block) {
          const localTriggerIndex = triggerIndex - block.start;
          const exprPart = block.content.slice(0, localTriggerIndex);
          latex = stripMathDelimiters(exprPart).trim();
          mathRange = { from: from + block.start, to: from + block.end };
      } else {
          // Fallback for non-delimited
          const fullBefore = segment.slice(0, triggerIndex);
          const boundaryMatch = fullBefore.match(/[A-Za-z0-9\\^_{}()+\-*/\s,.<>|]+$/);
          if (boundaryMatch) {
              latex = boundaryMatch[0].trim().replace(/^[-*+]\s+/, "");
          } else {
              latex = fullBefore.trim();
          }
      }

      // Ignore empty blocks or "mk" style skeletons
      if (latex && latex.length > 0 && !latex.includes("```")) {
          matches.push({ 
              kind, 
              latex, 
              mode, 
              fullMatch: triggerText,
              from: from + triggerIndex,
              to: from + triggerIndex + triggerText.length,
              mathRange
          });
      }
  }
  return matches;
}

function stripMathDelimiters(text: string): string {
    return text.replace(/^\$\$?|^\\\(|^\\\[/, "").replace(/\$\$?|\\\)|\\\]$/, "").trim();
}

// ── Widgets ────────────────────────────────────────────────────────

class ResultWidget extends WidgetType {
  constructor(
    private readonly plugin: KingsCalcLatexPlugin,
    private readonly trigger: TriggerMatch
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
      if (!(other instanceof ResultWidget)) return false;
      return other.trigger.latex === this.trigger.latex && 
             other.trigger.fullMatch === this.trigger.fullMatch &&
             JSON.stringify(other.trigger.mathRange) === JSON.stringify(this.trigger.mathRange);
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "kct-inline-widget";
    container.style.display = this.trigger.kind === "plot" ? "block" : "inline-block";
    
    if (this.trigger.kind === "plot") {
      container.classList.add("kct-graph-container");
      container.innerHTML = `<div class="kct-loading">Calculating graph...</div>`;
      void this.renderGraph(container);
    } else {
      container.innerText = " ...";
      void this.resolveEvaluation(container);
    }
    
    return container;
  }

  private async resolveEvaluation(container: HTMLElement): Promise<void> {
    try {
      if (this.trigger.kind === "evaluate") {
        const response = await this.plugin.engine.evaluate(this.trigger.latex, this.trigger.mode);
        const result = response.resultLatex || response.resultText || "No result";
        container.innerText = ` ${result}`;
      } else if (this.trigger.kind === "convert") {
          const value = parseFloat(this.trigger.latex);
          if (isNaN(value)) { container.innerText = " Invalid number"; return; }
          const response = await this.plugin.engine.convert(value, "unit", this.trigger.mode);
          container.innerText = ` ${response.resultText}`;
      } else if (this.trigger.kind === "persist") {
        const response = await this.plugin.engine.persist(this.trigger.latex);
        container.innerText = response.ok ? ` Stored ${response.storedSymbol}` : " Persist failed";
      }
    } catch (e) { container.innerText = " Engine offline"; }
  }

  private async renderGraph(container: HTMLElement): Promise<void> {
    try {
      const response = await this.plugin.engine.plot(this.trigger.latex, this.trigger.mode);
      if (response.ok && response.renderHtml) {
        container.innerHTML = "";
        const iframe = document.createElement("iframe");
        iframe.className = "kct-graph-iframe";
        const isDark = document.body.classList.contains("theme-dark");
        const themeClass = isDark ? "theme-dark" : "theme-light";
        iframe.srcdoc = `
          <style>
            body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
            .plotly-graph-div { height: 100vh !important; width: 100vw !important; }
          </style>
          <div class="${themeClass}">${response.renderHtml}</div>
        `;
        container.appendChild(iframe);

        this.plugin.publishInspectorState({
            title: "Kings CalcLatex Graph",
            summary: `Rendering ${this.trigger.mode}`,
            diagnostics: response.diagnostics.map((d: any) => d.message),
            renderHtml: response.renderHtml,
            latex: this.trigger.latex,
            mode: this.trigger.mode,
            variables: response.variables
        });
      } else { 
        container.innerText = " Plot failed"; 
      }
    } catch (e) { container.innerText = " Engine offline"; }
  }
}

// ── State Field ─────────────────────────────────────────────────────

export function createInlineRenderer(plugin: KingsCalcLatexPlugin) {
  const extension = StateField.define<DecorationSet>({
    create() { return Decoration.none; },
    update(decorations, tr) {
      if (!tr.docChanged && !tr.selection) return decorations;

      const builder = new RangeSetBuilder<Decoration>();
      const doc = tr.state.doc;
      const head = tr.state.selection.main.head;
      const cursorLine = doc.lineAt(head).number;

      // Scan all lines in document (or viewport if performance issue arise, but doc is safer for now)
      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const matches = detectTriggers(line.text, line.from, line.to);
        for (const match of matches) {
            const targetPos = match.mathRange ? match.mathRange.to : match.to;
            builder.add(
                targetPos,
                targetPos,
                Decoration.widget({
                    side: 1,
                    block: match.kind === "plot",
                    widget: new ResultWidget(plugin, match)
                })
            );
        }
      }
      return builder.finish();
    },
    provide(f) { return EditorView.decorations.from(f); }
  });

  const tabKeymap = keymap.of([{
      key: "Tab",
      run: (view) => {
          const head = view.state.selection.main.head;
          const line = view.state.doc.lineAt(head);
          const triggers = detectTriggers(line.text, line.from, line.to);
          
          const match = triggers.find(t => {
              const atTrigger = Math.abs(t.to - head) <= 1;
              const atMathEnd = t.mathRange && Math.abs(t.mathRange.to - head) <= 1;
              return atTrigger || atMathEnd;
          });

          if (match && (match.kind === "evaluate" || match.kind === "convert")) {
              void (async () => {
                  let result = "";
                  if (match.kind === "evaluate") {
                      const resp = await plugin.engine.evaluate(match.latex, match.mode);
                      result = resp.resultLatex || resp.resultText;
                  } else {
                      const value = parseFloat(match.latex);
                      if (!isNaN(value)) {
                          const resp = await plugin.engine.convert(value, "unit", match.mode);
                          result = resp.resultText;
                      }
                  }
                  
                  if (result) {
                      let insertPos = head;
                      if (match.mathRange && (head === match.mathRange.to || head === match.mathRange.to - 1)) {
                          const text = view.state.doc.sliceString(match.mathRange.from, match.mathRange.to);
                          if (text.endsWith("$")) insertPos = match.mathRange.to - 1;
                          if (text.endsWith("$$")) insertPos = match.mathRange.to - 2;
                      }
                      
                      view.dispatch({
                          changes: { from: insertPos, insert: result },
                          selection: { anchor: insertPos + result.length }
                      });
                  }
              })();
              return true;
          }
          return false;
      }
  }]);

  return [extension, Prec.highest(tabKeymap)];
}
