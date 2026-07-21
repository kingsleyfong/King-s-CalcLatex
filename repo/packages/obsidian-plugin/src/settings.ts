import { App, PluginSettingTab, Setting } from "obsidian";
import type KingsCalcLatexPlugin from "./main";

export class KingsCalcLatexSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: KingsCalcLatexPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "King's CalcLatex Settings" });

    new Setting(containerEl)
      .setName("Engine Base URL")
      .setDesc("The URL of your local Python math engine.")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:3210/api/v1")
          .setValue(this.plugin.settings.engineBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.engineBaseUrl = value;
            await this.plugin.saveSettings();
            this.plugin.reconnectEngine();
          })
      );

    new Setting(containerEl)
      .setName("Completion Key")
      .setDesc("The key to trigger inline evaluation results insertion.")
      .addText((text) =>
        text
          .setPlaceholder("Tab")
          .setValue(this.plugin.settings.completionKey)
          .onChange(async (value) => {
            this.plugin.settings.completionKey = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
