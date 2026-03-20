/**
 * King's CalcLatex v2 — Plugin Entry Point
 *
 * Wires together the engine, renderer, editor, and views modules.
 * This is the default export consumed by Obsidian's plugin loader.
 */

import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import type { KCLSettings, InspectorState, PlotSpec, GraphHandle } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { ExpressionEngine } from "./engine";
import { createDecorationPlugin, createTabKeymap } from "./editor";
import { create2DGraph } from "./renderer/renderer2d";
import { create3DGraph, renderSnapshot } from "./renderer/renderer3d";
import { KCLSettingTab } from "./settings";
import { GraphInspectorView, GRAPH_INSPECTOR_VIEW } from "./views/inspector";
import { initGiac, isGiacReady } from "./engine/giac";

export default class KingsCalcLatexPlugin extends Plugin {
  settings!: KCLSettings;
  engine!: ExpressionEngine;
  inspectorState: InspectorState = {
    title: "",
    summary: "",
    diagnostics: [],
  };

  /** Renderer facades — widgets call plugin.renderer2d.create() / plugin.renderer3d.create() */
  renderer2d = {
    create: (container: HTMLElement, spec: PlotSpec, showPOIs?: boolean): GraphHandle =>
      create2DGraph(container, spec, this.isDark(), showPOIs ?? this.settings.showPOIs),
  };
  renderer3d = {
    create: (container: HTMLElement, spec: PlotSpec): GraphHandle =>
      create3DGraph(container, spec, this.isDark(), this.settings.zoom3dMode, this.settings.show3DAxisTicks),
    renderSnapshot: (spec: PlotSpec): string =>
      renderSnapshot(spec, this.isDark(), this.settings.zoom3dMode, this.settings.show3DAxisTicks),
  };

  async onload(): Promise<void> {
    // 1. Load persisted settings
    await this.loadSettings();

    // 2. Initialize the expression engine
    this.engine = new ExpressionEngine(this.settings);

    // 3. Register the settings tab
    this.addSettingTab(new KCLSettingTab(this.app, this));

    // 4. Register the Graph Inspector sidebar view
    this.registerView(
      GRAPH_INSPECTOR_VIEW,
      (leaf: WorkspaceLeaf) => new GraphInspectorView(leaf, this),
    );

    // 5. Register CM6 editor extensions
    this.registerEditorExtension([
      createDecorationPlugin(this),
      createTabKeymap(this),
    ]);

    // 6. Register commands
    this.addCommand({
      id: "open-graph-inspector",
      name: "Open Graph Inspector",
      callback: () => {
        this.activateInspector();
      },
    });

    this.addCommand({
      id: "check-engine",
      name: "Check engine status",
      callback: () => {
        const status = this.engine.getStatus();
        new Notice(
          `KCL Engine: CortexJS ${status.cortexLoaded ? "loaded" : "not loaded"} | ` +
          `Giac ${isGiacReady() ? "loaded" : "not loaded"} | ` +
          `Variables: ${status.variableCount}`,
        );
      },
    });

    this.addCommand({
      id: "clear-variables",
      name: "Clear persisted variables",
      callback: () => {
        this.engine.clearVariables();
        new Notice("KCL: All persisted variables cleared.");
      },
    });

    // 7. Initialize Giac WASM CAS (async, non-blocking)
    if (this.settings.enableGiac) {
      const basePath = (this.app.vault.adapter as any).basePath as string;
      const pluginDir = basePath + "/.obsidian/plugins/" + this.manifest.id;
      initGiac(pluginDir).then((loaded) => {
        if (loaded) {
          console.log("KCL: Giac CAS engine ready");
        }
      });
    }

    // 8. Startup confirmation
    console.log("King's CalcLatex v2 loaded");
  }

  onunload(): void {
    // Detach all Graph Inspector leaves to prevent orphaned views
    this.app.workspace.detachLeavesOfType(GRAPH_INSPECTOR_VIEW);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData(),
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Push updated inspector state to all open Graph Inspector views.
   */
  publishInspectorState(state: InspectorState): void {
    this.inspectorState = state;
    for (const leaf of this.app.workspace.getLeavesOfType(GRAPH_INSPECTOR_VIEW)) {
      const view = leaf.view;
      if (view instanceof GraphInspectorView) {
        view.setInspectorState(state);
      }
    }
  }

  /**
   * Reveal the Graph Inspector in the right sidebar, creating a leaf
   * if none exists.
   */
  async activateInspector(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(GRAPH_INSPECTOR_VIEW);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: GRAPH_INSPECTOR_VIEW,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  /**
   * Detect whether Obsidian is currently using a dark theme.
   */
  isDark(): boolean {
    return document.body.classList.contains("theme-dark");
  }
}
