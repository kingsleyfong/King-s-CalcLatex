/**
 * King's CalcLatex v2 — Settings Tab
 *
 * Provides the plugin settings UI in Obsidian's settings panel.
 * Every change is persisted immediately via saveSettings().
 */

import { PluginSettingTab, Setting, App } from "obsidian";
import type KingsCalcLatexPlugin from "./main";

export class KCLSettingTab extends PluginSettingTab {
  plugin: KingsCalcLatexPlugin;

  constructor(app: App, plugin: KingsCalcLatexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "King's CalcLatex v2" });

    // ── 2D Default Range ─────────────────────────────────────
    new Setting(containerEl)
      .setName("2D default range")
      .setDesc(
        "Default x/y axis range for 2D graphs. Format: min,max (e.g. -10,10)",
      )
      .addText((text) =>
        text
          .setPlaceholder("-10,10")
          .setValue(this.plugin.settings.default2dRange.join(","))
          .onChange(async (value) => {
            const parsed = parseRange(value);
            if (parsed) {
              this.plugin.settings.default2dRange = parsed;
              await this.plugin.saveSettings();
            }
          }),
      );

    // ── 3D Default Range ─────────────────────────────────────
    new Setting(containerEl)
      .setName("3D default range")
      .setDesc(
        "Default x/y/z axis range for 3D graphs. Format: min,max (e.g. -5,5)",
      )
      .addText((text) =>
        text
          .setPlaceholder("-5,5")
          .setValue(this.plugin.settings.default3dRange.join(","))
          .onChange(async (value) => {
            const parsed = parseRange(value);
            if (parsed) {
              this.plugin.settings.default3dRange = parsed;
              await this.plugin.saveSettings();
            }
          }),
      );

    // ── Numeric Precision ────────────────────────────────────
    new Setting(containerEl)
      .setName("Numeric precision")
      .setDesc("Decimal places for approximate (\\approx) evaluations.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "4": "4 digits",
            "6": "6 digits",
            "8": "8 digits",
            "12": "12 digits",
            "16": "16 digits",
          })
          .setValue(String(this.plugin.settings.numericPrecision))
          .onChange(async (value) => {
            this.plugin.settings.numericPrecision = parseInt(value, 10);
            await this.plugin.saveSettings();
          }),
      );

    // ── Auto-Range ───────────────────────────────────────────
    new Setting(containerEl)
      .setName("Auto-range")
      .setDesc(
        "Automatically determine graph viewport from expression analysis.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoRange)
          .onChange(async (value) => {
            this.plugin.settings.autoRange = value;
            await this.plugin.saveSettings();
          }),
      );

    // ── Graph Theme ──────────────────────────────────────────
    new Setting(containerEl)
      .setName("Graph theme")
      .setDesc(
        'Color scheme for graphs. "Auto" follows Obsidian\'s current theme.',
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            auto: "Auto (follow Obsidian)",
            light: "Light",
            dark: "Dark",
          })
          .setValue(this.plugin.settings.graphTheme)
          .onChange(async (value) => {
            this.plugin.settings.graphTheme = value as
              | "auto"
              | "light"
              | "dark";
            await this.plugin.saveSettings();
          }),
      );

    // ── 3D Zoom Mode ──────────────────────────────────────────
    new Setting(containerEl)
      .setName("3D zoom mode")
      .setDesc(
        "Origin-centered: axes intersect at (0,0,0), zoom keeps ranges symmetric around 0. " +
        "Range-centered: zoom scales around the midpoint of the current range.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            origin: "Origin-centered",
            "range-center": "Range-centered",
          })
          .setValue(this.plugin.settings.zoom3dMode)
          .onChange(async (value) => {
            this.plugin.settings.zoom3dMode = value as
              | "origin"
              | "range-center";
            await this.plugin.saveSettings();
          }),
      );

    // ── 2D-on-3D Mode ──────────────────────────────────────────
    new Setting(containerEl)
      .setName("2D curves on 3D graphs")
      .setDesc(
        "How 2D equations (e.g. y=sin(x)) render when using @plot3d. " +
        '"Curtain" extrudes as a vertical wall. "Plane curve" draws at z=0.',
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            curtain: "Curtain (vertical wall)",
            "plane-curve": "Plane curve (z=0)",
          })
          .setValue(this.plugin.settings.plot3d2dMode)
          .onChange(async (value) => {
            this.plugin.settings.plot3d2dMode = value as
              | "curtain"
              | "plane-curve";
            await this.plugin.saveSettings();
          }),
      );

    // ── Vector Field Arrow Scale ──────────────────────────────────
    new Setting(containerEl)
      .setName("Vector field arrow scale")
      .setDesc(
        "Default arrow size for vector fields (1.0 = normal). " +
        "Can be overridden per-expression with @vecfield 0.5 or @vecfield 2.0.",
      )
      .addText((text) =>
        text
          .setPlaceholder("1.0")
          .setValue(String(this.plugin.settings.vecfieldArrowScale))
          .onChange(async (value) => {
            const n = parseFloat(value);
            if (isFinite(n) && n > 0) {
              this.plugin.settings.vecfieldArrowScale = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    // ── Points of Interest ──────────────────────────────────────
    new Setting(containerEl)
      .setName("Points of interest")
      .setDesc(
        "Show roots, extrema, and intersections on 2D graphs.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showPOIs)
          .onChange(async (value) => {
            this.plugin.settings.showPOIs = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}

/**
 * Parse a "min,max" string into a [number, number] tuple.
 * Returns null if the format is invalid.
 */
function parseRange(value: string): [number, number] | null {
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;
  const min = parseFloat(parts[0]);
  const max = parseFloat(parts[1]);
  if (isNaN(min) || isNaN(max) || min >= max) return null;
  return [min, max];
}
