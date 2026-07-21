import { App } from "obsidian";
import type KingsCalcLatexPlugin from "../main";
import { DEFAULT_LATEX_SUITE_SNIPPETS, RawSnippet } from "./default-snippets";

export class LaTeXSnippetManager {
  private activeSnippets: RawSnippet[] = DEFAULT_LATEX_SUITE_SNIPPETS;

  constructor(
    private app: App,
    private plugin: KingsCalcLatexPlugin,
  ) {}

  onload(): void {
    this.reloadSnippets();
  }

  onunload(): void {}

  reloadSnippets(): void {
    this.activeSnippets = [...DEFAULT_LATEX_SUITE_SNIPPETS];
  }

  getActiveSnippets(): RawSnippet[] {
    return this.activeSnippets;
  }
}
