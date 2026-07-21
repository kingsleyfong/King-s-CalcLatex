import { ItemView, WorkspaceLeaf } from "obsidian";
import type { InspectorState } from "./types";
import type KingsCalcLatexPlugin from "./main";

export const GRAPH_INSPECTOR_VIEW = "kcl-graph-inspector-view";

export class GraphInspectorView extends ItemView {
  private state: InspectorState = {
    title: "King's CalcLatex",
    summary: "Inspector is ready.",
    diagnostics: [],
  };

  constructor(leaf: WorkspaceLeaf, private readonly plugin: KingsCalcLatexPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return GRAPH_INSPECTOR_VIEW;
  }

  getDisplayText(): string {
    return "Graph Inspector";
  }

  getIcon(): string {
    return "presentation";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  setInspectorState(state: InspectorState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.classList.add("kct-inspector-container");

    const header = container.createDiv({ cls: "kct-inspector-header" });
    header.createEl("h4", { text: this.state.title });
    header.createEl("p", { text: this.state.summary, cls: "kct-summary" });

    if (this.state.renderHtml) {
      const graphBox = container.createDiv({ cls: "kct-inspector-graph" });
      const iframe = document.createElement("iframe");
      iframe.className = "kct-inspector-iframe";
      const isDark = document.body.classList.contains("theme-dark");
      const themeClass = isDark ? "theme-dark" : "theme-light";
      iframe.srcdoc = `
        <style>
          body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
          .plotly-graph-div { height: 100vh !important; width: 100vw !important; }
        </style>
        <div class="${themeClass}">${this.state.renderHtml}</div>
      `;
      graphBox.appendChild(iframe);

      // --- Range and Parameter Controls ---
      const controlBox = container.createDiv({ cls: "kct-inspector-advanced-controls" });
      
      // Ranges (x, y, z)
      controlBox.createEl("h5", { text: "Bounds" });
      const grid = controlBox.createDiv({ cls: "kct-range-grid" });
      ["x", "y", "z"].forEach(axis => {
          const row = grid.createDiv({ cls: "kct-range-row" });
          row.createSpan({ text: `${axis}: ` });
          const range = this.state.ranges?.[axis] || { min: -10, max: 10 };
          
          const minInput = row.createEl("input", { type: "number", value: range.min.toString() });
          minInput.onchange = (e) => {
              if (!this.state.ranges) this.state.ranges = {};
              this.state.ranges[axis] = { min: parseFloat((e.target as HTMLInputElement).value), max: range.max };
          };
          
          row.createSpan({ text: " to " });
          
          const maxInput = row.createEl("input", { type: "number", value: range.max.toString() });
          maxInput.onchange = (e) => {
              if (!this.state.ranges) this.state.ranges = {};
              this.state.ranges[axis] = { min: range.min, max: parseFloat((e.target as HTMLInputElement).value) };
          };
      });

      // Sliders (a, b, k, etc.)
      if (this.state.variables && this.state.variables.length > 0) {
          controlBox.createEl("h5", { text: "Parameters" });
          this.state.variables.forEach(v => {
              const row = controlBox.createDiv({ cls: "kct-parameter-row" });
              row.createSpan({ text: `${v}: ` });
              const val = this.state.params?.[v] ?? 1.0;
              
              const slider = row.createEl("input", { type: "range", value: val.toString() });
              slider.setAttribute("min", "-10");
              slider.setAttribute("max", "10");
              slider.setAttribute("step", "0.1");
              
              const valLabel = row.createSpan({ text: val.toFixed(1), cls: "kct-slider-value" });
              
              slider.oninput = (e) => {
                  const newVal = parseFloat((e.target as HTMLInputElement).value);
                  valLabel.innerText = newVal.toFixed(1);
                  if (!this.state.params) this.state.params = {};
                  this.state.params[v] = newVal;
              };
          });
      }

      const actions = container.createDiv({ cls: "kct-inspector-actions" });
      actions.createEl("button", { text: "Replot", cls: "mod-cta" }).onclick = () => {
          this.plugin.runGraphRefresh(this.state.latex || "", this.state.ranges, this.state.params);
      };
      actions.createEl("button", { text: "Copy LaTeX" }).onclick = () => {
          if (this.state.latex) navigator.clipboard.writeText(this.state.latex);
      };
    }

    if (this.state.diagnostics.length > 0) {
      const diagBox = container.createDiv({ cls: "kct-inspector-diagnostics" });
      diagBox.createEl("h5", { text: "Diagnostics" });
      const ul = diagBox.createEl("ul");
      this.state.diagnostics.forEach((d) => ul.createEl("li", { text: d }));
    }
  }
}
