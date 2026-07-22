import { App, WorkspaceLeaf } from "obsidian";
import type KingsCalcLatexPlugin from "../main";
import { TextareaInterceptor } from "./interceptor";
import { SnippetEngine } from "./snippet-engine";
import { PreviewTooltip } from "./preview-tooltip";
import { LaTexModalEnhancer } from "./latex-modal";
import { SidebarStyleEnhancer } from "./sidebar-enhancer";
import { GraphInjector } from "./graph-injector";
import DEFAULT_SNIPPETS from "../latex-suite/default_snippets.js";
import DEFAULT_SNIPPET_VARIABLES from "../latex-suite/default_snippet_variables.js";
import { parseSnippets, parseSnippetVariables } from "../latex-suite/snippets/parse";
import type { SnippetDef } from "./types";

export class ExcalidrawCompanionManager {
  private interceptor: TextareaInterceptor | null = null;
  private snippetEngine: SnippetEngine | null = null;
  private tooltip: PreviewTooltip | null = null;
  private modalEnhancer: LaTexModalEnhancer | null = null;
  private sidebarEnhancer: SidebarStyleEnhancer | null = null;
  private graphInjector: GraphInjector | null = null;
  private handleKeydownBound: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private app: App,
    private plugin: KingsCalcLatexPlugin,
  ) {}

  async onload(): Promise<void> {
    if (!this.plugin.settings.enableExcalidrawOD) return;

    this.snippetEngine = new SnippetEngine();

    // Populate Excalidraw SnippetEngine using forked latex-suite parser
    const variables = await parseSnippetVariables(DEFAULT_SNIPPET_VARIABLES, "snippet-variables.js");
    const parsedRaw = await parseSnippets(DEFAULT_SNIPPETS, variables, "snippets.js");

    const convertedSnippets: SnippetDef[] = parsedRaw
      .filter((s) => {
        const tr = typeof s.trigger === "string" ? s.trigger : "";
        return tr !== "dm"; // Exclude dm snippet in Excalidraw textareas
      })
      .map((s) => {
        const optsStr = s.options ? String(s.options) : "";
        const rawRepl = typeof s.replacement === "string" ? s.replacement : "";
        return {
          trigger: s.trigger as string | RegExp,
          replacement: rawRepl,
          options: optsStr,
          description: s.description || "",
          priority: s.priority || 0,
          flags: {
            math: optsStr.includes("m"),
            text: optsStr.includes("t"),
            display: optsStr.includes("d"),
            auto: optsStr.includes("A"),
            regex: optsStr.includes("r") || s.trigger instanceof RegExp,
            word: optsStr.includes("w"),
            visual: rawRepl.includes("${VISUAL}"),
          },
        };
      });
    this.snippetEngine.setSnippets(convertedSnippets);

    this.tooltip = new PreviewTooltip(this.plugin.settings);
    this.modalEnhancer = new LaTexModalEnhancer(this.plugin.settings);
    this.sidebarEnhancer = new SidebarStyleEnhancer(this.plugin);
    this.graphInjector = new GraphInjector(
      this.plugin.engine,
      this.plugin,
      this.plugin.settings,
    );

    this.tooltip.create();
    this.modalEnhancer.start();

    this.interceptor = new TextareaInterceptor(
      (textarea, view) => this.onTextareaAttach(textarea, view),
      () => this.onTextareaDetach(),
    );

    // Register global keydown listener for Ctrl+\ / Ctrl+Click LaTeX prompt shortcut
    this.handleKeydownBound = (e: KeyboardEvent) => this.handleLaTeXShortcut(e);
    window.addEventListener("keydown", this.handleKeydownBound, true);

    // Watch existing and newly opened leaves
    this.app.workspace.iterateAllLeaves((leaf) => this.watchLeafIfExcalidraw(leaf));
    this.plugin.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf) this.watchLeafIfExcalidraw(leaf);
      }),
    );
    this.plugin.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.app.workspace.iterateAllLeaves((leaf) => this.watchLeafIfExcalidraw(leaf));
      }),
    );
  }

  onunload(): void {
    if (this.handleKeydownBound) {
      window.removeEventListener("keydown", this.handleKeydownBound, true);
      this.handleKeydownBound = null;
    }
    if (this.interceptor) this.interceptor.destroy();
    if (this.snippetEngine) this.snippetEngine.detach();
    if (this.tooltip) this.tooltip.destroy();
    if (this.modalEnhancer) this.modalEnhancer.destroy();
    if (this.sidebarEnhancer) this.sidebarEnhancer.destroy();
  }

  private watchLeafIfExcalidraw(leaf: WorkspaceLeaf): void {
    const viewType = leaf.view?.getViewType?.();
    if (viewType === "excalidraw" || (leaf.view as any)?.excalidrawWrapperRef) {
      if (this.interceptor) this.interceptor.watchLeaf(leaf);
      if (this.sidebarEnhancer) this.sidebarEnhancer.watchLeaf(leaf);
    }
  }

  private onTextareaAttach(textarea: HTMLTextAreaElement, view: any): void {
    if (this.plugin.settings.excalidrawSnippetsEnabled && this.snippetEngine) {
      this.snippetEngine.attach(textarea);
    }

    if (this.plugin.settings.excalidrawPreviewTooltipEnabled && this.tooltip) {
      const handleInput = () => {
        this.tooltip?.update(textarea.value, textarea, view);
      };
      textarea.addEventListener("input", handleInput);
      handleInput();
    }
  }

  private onTextareaDetach(): void {
    if (this.tooltip) {
      this.tooltip.hide();
    }
  }

  /**
   * Keyboard shortcut (default Ctrl+\) / Ctrl+Click to edit selected Excalidraw LaTeX equation / PNG element.
   */
  private handleLaTeXShortcut(e: KeyboardEvent): void {
    if (!this.plugin.settings.latexEditorShortcutEnabled) return;

    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl.classList.contains("cm-content"))
    ) {
      return;
    }

    const modifier = this.plugin.settings.latexEditorShortcutModifier;
    let modifierMatches = false;
    if (modifier === "ctrl" && (e.ctrlKey || e.metaKey)) {
      modifierMatches = true;
    } else if (modifier === "alt" && e.altKey) {
      modifierMatches = true;
    } else if (modifier === "shift" && e.shiftKey) {
      modifierMatches = true;
    }

    if (!modifierMatches) return;

    const targetKey = (this.plugin.settings.latexEditorShortcutKey || "\\").toLowerCase();
    const pressedKey = e.key.toLowerCase();
    const isKeyMatch =
      pressedKey === targetKey ||
      (targetKey === "\\" && (pressedKey === "\\" || e.code === "Backslash"));

    if (!isKeyMatch) return;

    const activeLeaf = this.app.workspace.activeLeaf || (this.app.workspace as any).getActiveLeaf();
    if (!activeLeaf || activeLeaf.view?.getViewType?.() !== "excalidraw") return;

    const view = activeLeaf.view as any;
    const api = this.getExcalidrawAPI(view);
    if (!api) return;

    const selectedIds = Object.keys(api.getAppState().selectedElementIds || {});
    if (selectedIds.length !== 1) return;

    const elements = api.getSceneElements();
    const el = elements.find((x: any) => x.id === selectedIds[0] && !x.isDeleted);
    if (!el) return;

    const isLaTeX =
      el.type === "image" &&
      (el.customData?.latex ||
        (view.excalidrawData &&
          typeof view.excalidrawData.getEquation === "function" &&
          view.excalidrawData.getEquation(el.fileId)));

    if (!isLaTeX) return;

    e.preventDefault();
    e.stopPropagation();

    const canvas = view.contentEl?.querySelector?.(".excalidraw__canvas");
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const appState = api.getAppState();
    const zoom = appState.zoom.value;
    const scrollX = appState.scrollX;
    const scrollY = appState.scrollY;

    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;

    const clientX = rect.left + (cx - scrollX) * zoom;
    const clientY = rect.top + (cy - scrollY) * zoom;

    const common = {
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      button: 0,
      buttons: 1,
      pointerType: "mouse" as const,
    };

    canvas.dispatchEvent(new PointerEvent("pointerdown", common));
    canvas.dispatchEvent(new MouseEvent("mousedown", common));
    canvas.dispatchEvent(new PointerEvent("pointerup", common));
    canvas.dispatchEvent(new MouseEvent("mouseup", common));
    canvas.dispatchEvent(new MouseEvent("click", common));
  }

  private getExcalidrawAPI(view: any): any {
    try {
      if (view.excalidrawAPI) return view.excalidrawAPI;
      if (view.ea?.getExcalidrawAPI) return view.ea.getExcalidrawAPI();
      const ea = (window as any).ExcalidrawAutomate;
      if (ea?.getExcalidrawAPI) return ea.getExcalidrawAPI();
    } catch {}
    return null;
  }
}
