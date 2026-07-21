/**
 * King's CalcLatex v2 — Graph Inspector Sidebar View
 *
 * Shows a large interactive graph, diagnostics, and controls.
 * Opened via the "Open Graph Inspector" command.
 */

import { ItemView, WorkspaceLeaf, renderMath, finishRenderMath } from "obsidian";
import type { InspectorState, GraphHandle } from "../types";
import type KingsCalcLatexPlugin from "../main";
import { create2DGraph } from "../renderer/renderer2d";
import { create3DGraph } from "../renderer/renderer3d";
import { createParameterControls, destroyParameterControls } from "./controls";

export const GRAPH_INSPECTOR_VIEW = "kcl-graph-inspector-view";

export class GraphInspectorView extends ItemView {
  private plugin: KingsCalcLatexPlugin;
  private state: InspectorState;
  private currentHandle: GraphHandle | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: KingsCalcLatexPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.state = plugin.inspectorState;
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

  async onClose(): Promise<void> {
    this.destroyCurrentGraph();
  }

  /**
   * Called by the plugin when inspector state is updated externally.
   */
  setInspectorState(state: InspectorState): void {
    this.state = state;
    this.render();
  }

  /**
   * Destroy the current graph handle, freeing WebGL/Canvas resources.
   */
  private destroyCurrentGraph(): void {
    if (this.currentHandle) {
      this.currentHandle.destroy();
      this.currentHandle = null;
    }
  }

  /**
   * Render the full inspector UI from current state.
   */
  private render(): void {
    // Container is the second child of containerEl (first is the nav header)
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("kcl-inspector");

    // Destroy any previous graph before re-rendering
    this.destroyCurrentGraph();

    // ── Header ───────────────────────────────────────────────
    const header = container.createDiv({ cls: "kcl-inspector-header" });
    const h3 = header.createEl("h3");
    const titleText = this.state.title || "Graph Inspector";
    try {
      // Render the title as formatted LaTeX if it looks like a math expression
      if (this.state.title) {
        const rendered = renderMath(titleText.replace(/@\w+\s*$/i, "").trim(), false);
        h3.appendChild(rendered);
        finishRenderMath();
      } else {
        h3.textContent = titleText;
      }
    } catch {
      h3.textContent = titleText;
    }
    if (this.state.summary) {
      header.createEl("p", {
        text: this.state.summary,
        cls: "kcl-inspector-summary",
      });
    }

    // ── Graph ────────────────────────────────────────────────
    if (this.state.spec) {
      const spec = this.state.spec;
      const graphContainer = container.createDiv({
        cls: "kcl-inspector-graph",
      });

      // Determine 2D vs 3D from the first expression's type
      const is3D =
        spec.data.length > 0 &&
        (spec.data[0].type === "explicit_3d" ||
         spec.data[0].type === "implicit_3d" ||
         spec.data[0].type === "parametric_3d" ||
         spec.data[0].type === "vector_3d");

      try {
        if (is3D) {
          this.currentHandle = create3DGraph(
            graphContainer,
            spec,
            this.plugin.isDark(),
            this.plugin.settings.zoom3dMode,
            this.plugin.settings.show3DAxisTicks,
          );
        } else {
          this.currentHandle = create2DGraph(
            graphContainer,
            spec,
            this.plugin.isDark(),
          );
        }
      } catch (e) {
        graphContainer.createEl("p", {
          text: `Graph rendering failed: ${e instanceof Error ? e.message : String(e)}`,
          cls: "kcl-inspector-error",
        });
      }

      // ── Parameter sliders for free variables ───────────────
      if (spec.freeVars.length > 0) {
        const sliderContainer = container.createDiv({
          cls: "kcl-inspector-sliders",
        });
        createParameterControls(
          sliderContainer,
          spec.freeVars,
          (params: Record<string, number>) => {
            // Re-render graph with updated parameter values
            // The engine would need to recompile with substituted params;
            // for now, pass through to update if the handle supports it
            if (this.currentHandle && this.state.spec) {
              this.currentHandle.update(this.state.spec);
            }
          },
        );
      }

      // ── Controls ───────────────────────────────────────────
      const controls = container.createDiv({
        cls: "kcl-inspector-controls",
      });

      const copyBtn = controls.createEl("button", {
        text: "Copy LaTeX",
        cls: "kcl-inspector-btn",
      });
      copyBtn.addEventListener("click", () => {
        if (this.state.latex) {
          navigator.clipboard.writeText(this.state.latex);
        }
      });

      const refreshBtn = controls.createEl("button", {
        text: "Refresh",
        cls: "kcl-inspector-btn",
      });
      refreshBtn.addEventListener("click", () => {
        this.render();
      });
    }

    // ── Diagnostics ──────────────────────────────────────────
    if (this.state.diagnostics.length > 0) {
      const diagSection = container.createDiv({
        cls: "kcl-inspector-diagnostics",
      });
      diagSection.createEl("h4", { text: "Diagnostics" });
      const list = diagSection.createEl("ul");
      for (const msg of this.state.diagnostics) {
        list.createEl("li", { text: msg });
      }
    }
  }
}
