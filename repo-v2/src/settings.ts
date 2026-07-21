/**
 * King's CalcLatex v2 — Settings Tab
 *
 * Provides split settings UI for Markdown Note features and Excalidraw OD features.
 */

import { PluginSettingTab, Setting, App } from "obsidian";
import type KingsCalcLatexPlugin from "./main";
import { isGiacReady } from "./engine/giac";

export class KCLSettingTab extends PluginSettingTab {
  plugin: KingsCalcLatexPlugin;

  constructor(app: App, plugin: KingsCalcLatexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "King's CalcLatex Settings" });

    // ══════════════════════════════════════════════════════════════
    //  SECTION 1: MARKDOWN NOTE FEATURES (.md)
    // ══════════════════════════════════════════════════════════════
    const mdHeader = containerEl.createEl("h3", { text: "Markdown Note Features (.md)" });
    mdHeader.style.cssText = "color: var(--text-accent); margin-top: 1.5em; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 0.3em;";

    new Setting(containerEl)
      .setName("2D default range")
      .setDesc("Default x/y axis range for 2D graphs in note code blocks. Format: min,max (e.g. -10,10)")
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

    new Setting(containerEl)
      .setName("3D default range")
      .setDesc("Default x/y/z axis range for 3D graphs in note code blocks. Format: min,max (e.g. -5,5)")
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

    new Setting(containerEl)
      .setName("Numeric precision")
      .setDesc("Decimal places for approximate (\\approx) evaluations in markdown notes.")
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

    new Setting(containerEl)
      .setName("Auto-range")
      .setDesc("Automatically determine graph viewport from expression analysis.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoRange)
          .onChange(async (value) => {
            this.plugin.settings.autoRange = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Graph theme")
      .setDesc('Color scheme for graphs in notes. "Auto" follows Obsidian\'s current theme.')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            auto: "Auto (follow Obsidian)",
            light: "Light",
            dark: "Dark",
          })
          .setValue(this.plugin.settings.graphTheme)
          .onChange(async (value) => {
            this.plugin.settings.graphTheme = value as "auto" | "light" | "dark";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("3D zoom mode")
      .setDesc("Origin-centered: axes intersect at (0,0,0). Range-centered: zoom scales around current midpoint.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            origin: "Origin-centered",
            "range-center": "Range-centered",
          })
          .setValue(this.plugin.settings.zoom3dMode)
          .onChange(async (value) => {
            this.plugin.settings.zoom3dMode = value as "origin" | "range-center";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("2D curves on 3D graphs")
      .setDesc('How 2D equations render when using @plot3d. "Curtain" extrudes as wall, "Plane curve" draws at z=0.')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            curtain: "Curtain (vertical wall)",
            "plane-curve": "Plane curve (z=0)",
          })
          .setValue(this.plugin.settings.plot3d2dMode)
          .onChange(async (value) => {
            this.plugin.settings.plot3d2dMode = value as "curtain" | "plane-curve";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Vector field arrow scale")
      .setDesc("Default arrow size for vector fields in markdown graphs (1.0 = normal).")
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

    new Setting(containerEl)
      .setName("Points of interest")
      .setDesc("Show roots, extrema, and intersections on 2D note graphs.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showPOIs)
          .onChange(async (value) => {
            this.plugin.settings.showPOIs = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("3D axis tick marks")
      .setDesc("Show tick marks and numeric labels along X, Y, and Z axes.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.show3DAxisTicks)
          .onChange(async (value) => {
            this.plugin.settings.show3DAxisTicks = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Auto-scale Z axis (3D)")
      .setDesc("Automatically fit Z axis to surface range (breaks 1:1:1 proportional scaling).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoScaleZ3d)
          .onChange(async (value) => {
            this.plugin.settings.autoScaleZ3d = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Enable Giac WASM CAS")
      .setDesc(
        `Load Giac computer algebra system for advanced operations (limits, Taylor, ODEs). Status: ${
          isGiacReady() ? "Loaded" : "Not loaded"
        }`,
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableGiac)
          .onChange(async (value) => {
            this.plugin.settings.enableGiac = value;
            await this.plugin.saveSettings();
          }),
      );

    // ══════════════════════════════════════════════════════════════
    //  SECTION 2: EXCALIDRAW OD FEATURES (CANVAS & MATH COMPANION)
    // ══════════════════════════════════════════════════════════════
    const exHeader = containerEl.createEl("h3", { text: "Excalidraw OD Features (Canvas & Math Companion)" });
    exHeader.style.cssText = "color: var(--text-accent); margin-top: 2em; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 0.3em;";

    new Setting(containerEl)
      .setName("Enable Excalidraw OD Integration")
      .setDesc("Enable math companion, snippet expansion, live preview tooltips, and plot placement on Excalidraw canvases.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableExcalidrawOD)
          .onChange(async (value) => {
            this.plugin.settings.enableExcalidrawOD = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("LaTeX Prompt Modal Window Position")
      .setDesc("Choose default location for the Excalidraw LaTeX prompt edit window. Default: Near Bottom of Screen.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            bottom: "Near Bottom of Screen (Recommended)",
            center: "Center of Screen",
            top: "Top of Screen",
            cursor: "Near Selection / Cursor",
          })
          .setValue(this.plugin.settings.latexModalPosition || "bottom")
          .onChange(async (value) => {
            this.plugin.settings.latexModalPosition = value as "bottom" | "center" | "top" | "cursor";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Auto-Expanding Snippets in Textareas")
      .setDesc("Enable LaTeX Suite snippet auto-expansion inside Excalidraw text editing overlays.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.excalidrawSnippetsEnabled)
          .onChange(async (value) => {
            this.plugin.settings.excalidrawSnippetsEnabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Live Math Preview Tooltip")
      .setDesc("Display live MathJax SVG preview tooltip while typing math in Excalidraw textareas.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.excalidrawPreviewTooltipEnabled)
          .onChange(async (value) => {
            this.plugin.settings.excalidrawPreviewTooltipEnabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Preview Tooltip Position")
      .setDesc("Position of the live MathJax preview tooltip relative to the editing textarea.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            below: "Below Textarea",
            above: "Above Textarea",
          })
          .setValue(this.plugin.settings.excalidrawPreviewPosition || "below")
          .onChange(async (value) => {
            this.plugin.settings.excalidrawPreviewPosition = value as "above" | "below";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Excalidraw Plot Width")
      .setDesc("Default width in pixels for plots rendered and inserted into Excalidraw canvases.")
      .addText((text) =>
        text
          .setPlaceholder("500")
          .setValue(String(this.plugin.settings.excalidrawGraphWidth))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 100) {
              this.plugin.settings.excalidrawGraphWidth = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Excalidraw Plot Height")
      .setDesc("Default height in pixels for plots rendered and inserted into Excalidraw canvases.")
      .addText((text) =>
        text
          .setPlaceholder("350")
          .setValue(String(this.plugin.settings.excalidrawGraphHeight))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 100) {
              this.plugin.settings.excalidrawGraphHeight = n;
              await this.plugin.saveSettings();
            }
          }),
      );
    new Setting(containerEl)
      .setName("LaTeX Equation Edit Shortcut")
      .setDesc("Enable keyboard shortcut (e.g. Ctrl + L) to quickly open the LaTeX prompt modal when an equation element is selected.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.latexEditorShortcutEnabled)
          .onChange(async (value) => {
            this.plugin.settings.latexEditorShortcutEnabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("LaTeX Shortcut Key & Modifier")
      .setDesc("Configure modifier and trigger key for the LaTeX equation edit shortcut (Default: Ctrl + L).")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            ctrl: "Ctrl / Cmd",
            alt: "Alt / Option",
            shift: "Shift",
          })
          .setValue(this.plugin.settings.latexEditorShortcutModifier || "ctrl")
          .onChange(async (value) => {
            this.plugin.settings.latexEditorShortcutModifier = value as "ctrl" | "alt" | "shift";
            await this.plugin.saveSettings();
          }),
      )
      .addText((text) =>
        text
          .setPlaceholder("\\")
          .setValue(this.plugin.settings.latexEditorShortcutKey || "\\")
          .onChange(async (value) => {
            const key = value.trim().toLowerCase();
            if (key) {
              this.plugin.settings.latexEditorShortcutKey = key;
              await this.plugin.saveSettings();
            }
          }),
      );

    // ══════════════════════════════════════════════════════════════
    //  SECTION 3: LATEX SUITE FEATURES (SNIPPETS & FAST MATH ENTRY)
    // ══════════════════════════════════════════════════════════════
    const lsHeader = containerEl.createEl("h3", { text: "LaTeX Suite Features (Snippets & Fast Math Entry)" });
    lsHeader.style.cssText = "color: var(--text-accent); margin-top: 2em; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 0.3em;";

    new Setting(containerEl)
      .setName("Enable Ingested LaTeX Suite Snippet Engine")
      .setDesc("Enable trigger auto-expansion (mk -> $ $, dm -> $$ $$, sr -> ^2, fra -> \\frac{}{}) across Markdown notes and Excalidraw text overlays.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableLaTeXSuite)
          .onChange(async (value) => {
            this.plugin.settings.enableLaTeXSuite = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Inline Math Mode Trigger")
      .setDesc("Trigger string to create an inline math block ($ $). Default: mk.")
      .addText((text) =>
        text
          .setPlaceholder("mk")
          .setValue(this.plugin.settings.inlineMathTrigger || "mk")
          .onChange(async (value) => {
            const tr = value.trim();
            if (tr) {
              this.plugin.settings.inlineMathTrigger = tr;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Display Math Mode Trigger")
      .setDesc("Trigger string to create a display math block ($$ $$). Default: dm.")
      .addText((text) =>
        text
          .setPlaceholder("dm")
          .setValue(this.plugin.settings.displayMathTrigger || "dm")
          .onChange(async (value) => {
            const tr = value.trim();
            if (tr) {
              this.plugin.settings.displayMathTrigger = tr;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Auto-Fraction Expansion")
      .setDesc("Automatically convert fra or // into \\frac{num}{den} with cursor tabstop navigation.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoFraction)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoFraction = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Matrix Environment Shortcuts")
      .setDesc("Automatically expand pmat, bmat, and vmat into matrix environment blocks.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableMatrixShortcuts)
          .onChange(async (value) => {
            this.plugin.settings.enableMatrixShortcuts = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Auto-Subscript Digits")
      .setDesc("Automatically convert letter followed by digit into subscript (e.g. x1 -> x_1, a2 -> a_2).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoSubscript)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoSubscript = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Custom Snippet Definitions")
      .setDesc("Define custom JSON snippet definitions to override or add to default snippets. Format: [{\"trigger\":\"foo\",\"replacement\":\"bar\",\"options\":\"mA\"}]")
      .addTextArea((text) =>
        text
          .setPlaceholder('[{"trigger": "example", "replacement": "\\\\example{$1}$0", "options": "mA"}]')
          .setValue(this.plugin.settings.customSnippetsText || "")
          .onChange(async (value) => {
            this.plugin.settings.customSnippetsText = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}

function parseRange(value: string): [number, number] | null {
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;
  const min = parseFloat(parts[0]);
  const max = parseFloat(parts[1]);
  if (isNaN(min) || isNaN(max) || min >= max) return null;
  return [min, max];
}
