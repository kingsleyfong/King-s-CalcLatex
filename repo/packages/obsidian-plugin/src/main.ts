import { Plugin, WorkspaceLeaf } from "obsidian";
import { createInlineRenderer } from "./editor";
import { EngineClient } from "./service";
import { KingsCalcLatexSettingTab } from "./settings";
import type { InspectorState, KingsCalcLatexSettings } from "./types";
import { GRAPH_INSPECTOR_VIEW, GraphInspectorView } from "./view";

const DEFAULT_SETTINGS: KingsCalcLatexSettings = {
  engineBaseUrl: "http://127.0.0.1:3210/api/v1",
  completionKey: "Tab",
};

export default class KingsCalcLatexPlugin extends Plugin {
  settings: KingsCalcLatexSettings = DEFAULT_SETTINGS;
  engine!: EngineClient;
  private inspectorState: InspectorState = {
    title: "King's CalcLatex",
    summary: "Graph inspector is ready.",
    diagnostics: [],
  };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.engine = new EngineClient(this.settings.engineBaseUrl);
    this.addSettingTab(new KingsCalcLatexSettingTab(this.app, this));

    this.registerView(
      GRAPH_INSPECTOR_VIEW,
      (leaf) => new GraphInspectorView(leaf, this)
    );

    this.registerEditorExtension([createInlineRenderer(this)]);

    this.addCommand({
      id: "open-graph-inspector",
      name: "Open Graph Inspector",
      callback: async () => {
        await this.activateInspector();
      },
    });

    this.addCommand({
        id: "check-engine-health",
        name: "Check Engine Health",
        callback: async () => {
          const ok = await this.engine.health();
          this.publishInspectorState({
            title: "Engine Health",
            summary: ok ? "Engine is online" : "Engine is offline",
            diagnostics: [ok ? "Successfully reached localhost:3210" : "Could not reach local Python engine."],
          });
        },
    });
  }

  onunload(): void {
    this.app.workspace.getLeavesOfType(GRAPH_INSPECTOR_VIEW).forEach(leaf => leaf.detach());
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  reconnectEngine(): void {
    this.engine = new EngineClient(this.settings.engineBaseUrl);
  }

  async activateInspector(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(GRAPH_INSPECTOR_VIEW)[0];
    if (!leaf) {
        leaf = this.app.workspace.getRightLeaf(false);
        await leaf.setViewState({ type: GRAPH_INSPECTOR_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  publishInspectorState(state: InspectorState): void {
    // Preserve ranges and params if not provided in new state
    this.inspectorState = { ...this.inspectorState, ...state };
    this.app.workspace.getLeavesOfType(GRAPH_INSPECTOR_VIEW).forEach((leaf) => {
      if (leaf.view instanceof GraphInspectorView) {
        leaf.view.setInspectorState(this.inspectorState);
      }
    });
  }

  async runGraphRefresh(latex: string, ranges?: any, params?: any): Promise<void> {
      const mode = this.inspectorState.mode || "plot2d";
      const response = await this.engine.plot(latex, mode, ranges, params);
      this.publishInspectorState({
          ...this.inspectorState,
          renderHtml: response.renderHtml,
          diagnostics: response.diagnostics.map((d: any) => d.message),
          ranges: ranges || this.inspectorState.ranges,
          params: params || this.inspectorState.params
      });
  }
}
