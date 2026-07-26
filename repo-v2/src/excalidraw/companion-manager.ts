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
import type { SnippetDef } from "./types";

const VALID_REGEX_FLAGS = ["i", "m", "s", "u", "v"];

function filterRegexFlags(flags: string): string {
  return Array.from(new Set((flags || "").split(""))).filter((f) => VALID_REGEX_FLAGS.includes(f)).join("");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns the inner LaTeX if `text` (trimmed) is ENTIRELY a single $...$ or $$...$$
 * block with non-empty content, otherwise null. Deliberately whole-string only --
 * this drives auto-conversion of a just-finished text element to an equation image,
 * so partial/mixed text ("see $x=1$ above") must NOT match.
 */
function extractFullMathBlock(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
    const inner = trimmed.slice(2, -2).trim();
    return inner.length > 0 ? inner : null;
  }
  if (
    trimmed.startsWith("$") &&
    trimmed.endsWith("$") &&
    trimmed.length > 2 &&
    !trimmed.slice(1, -1).includes("$")
  ) {
    const inner = trimmed.slice(1, -1).trim();
    return inner.length > 0 ? inner : null;
  }
  return null;
}

/**
 * Converts King's CalcLatex's pre-compiled default snippet data into the shape
 * the Excalidraw companion's own lightweight SnippetEngine expects.
 *
 * NOTE: this deliberately does NOT use latex-suite/snippets/parse.ts's
 * parseSnippets()/parseSnippetVariables() -- those expect a raw JS *source string*
 * to eval via a Blob URL import (upstream's original architecture, before this fork
 * pre-compiled the snippet data to satisfy Obsidian's CSP). Calling them with our
 * already-compiled array/object throws "Invalid format" immediately, which silently
 * aborted the rest of ExcalidrawCompanionManager.onload() -- meaning the snippet
 * engine, blur interceptor, preview tooltip, and modal enhancer never initialized
 * at all. This function does the equivalent work directly on the pre-compiled data.
 */
function buildExcalidrawSnippets(): SnippetDef[] {
  const variables = DEFAULT_SNIPPET_VARIABLES as Record<string, string>;
  const substitute = (s: string): string => {
    let result = s;
    for (const [name, pattern] of Object.entries(variables)) {
      result = result.replaceAll(name, pattern);
    }
    return result;
  };

  return (DEFAULT_SNIPPETS as any[])
    .flat()
    .filter((s) => {
      // Only the literal 2-char "dm" string trigger is excluded in Excalidraw
      // textareas -- regex triggers that merely *contain* "dm" (e.g. the
      // "display math in a list" snippet) must NOT be caught by this, so this
      // must check the raw trigger's type/value directly rather than coercing
      // non-string triggers to "" first (that coercion previously let a
      // RegExp trigger silently sneak past this filter AND get mangled below).
      return !(typeof s.trigger === "string" && s.trigger === "dm");
    })
    .map((s) => {
      const optsStr = s.options ? String(s.options) : "";
      const isRegexTrigger = s.trigger instanceof RegExp;

      // Non-string triggers are always RegExp in this dataset. Extract the
      // actual pattern source instead of discarding it to "" -- discarding it
      // previously produced `new RegExp("(?:)$")`, which matches the empty
      // string at the end of ANY text, i.e. fires on every keystroke.
      const rawTriggerSource = isRegexTrigger
        ? (s.trigger as RegExp).source
        : typeof s.trigger === "string"
          ? s.trigger
          : "";
      const substitutedTrigger = substitute(rawTriggerSource);

      // Function replacements (used by regex snippets with capture-group
      // logic) must be preserved, not discarded to "" -- matchRegexSnippet
      // already knows how to call a function replacement.
      const rawRepl: string | ((match: RegExpExecArray) => string) =
        typeof s.replacement === "string"
          ? substitute(s.replacement)
          : typeof s.replacement === "function"
            ? s.replacement
            : "";

      let trigger: string | RegExp = substitutedTrigger;
      if (optsStr.includes("r") || isRegexTrigger) {
        try {
          // Reuse the original RegExp's own flags when we have them; the raw
          // snippet objects never carry a separate `.flags` string field, so
          // falling back to `s.flags` here (as before) only ever fed
          // `String(undefined)` into the flag filter -- coincidentally
          // leaking stray "u"/"i" flags onto every regex-string trigger.
          const flagSource = isRegexTrigger ? (s.trigger as RegExp).flags : "";
          trigger = new RegExp(`(?:${substitutedTrigger})$`, filterRegexFlags(flagSource));
        } catch {
          /* Fall back to literal string match if the pattern fails to compile. */
          trigger = substitutedTrigger;
        }
      }

      const replacementForVisualCheck = typeof rawRepl === "string" ? rawRepl : "";

      return {
        trigger,
        replacement: rawRepl,
        options: optsStr,
        description: s.description || "",
        priority: s.priority || 0,
        flags: {
          math: optsStr.includes("m"),
          text: optsStr.includes("t"),
          display: optsStr.includes("d"),
          auto: optsStr.includes("A"),
          regex: optsStr.includes("r") || isRegexTrigger,
          word: optsStr.includes("w"),
          visual: replacementForVisualCheck.includes("${VISUAL}"),
        },
      };
    });
}

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
    console.log("[KCL-DEBUG] companion onload() starting, enableExcalidrawOD:", this.plugin.settings.enableExcalidrawOD);
    if (!this.plugin.settings.enableExcalidrawOD) return;

    this.snippetEngine = new SnippetEngine();
    const built = buildExcalidrawSnippets();
    console.log("[KCL-DEBUG] buildExcalidrawSnippets produced", built.length, "snippets");
    this.snippetEngine.setSnippets(built);

    this.tooltip = new PreviewTooltip(this.plugin.settings);
    this.modalEnhancer = new LaTexModalEnhancer(this.plugin.settings, built, this.plugin);
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
      (text, view) => this.onTextareaBlurCommit(text, view),
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
    const isExcalidraw = viewType === "excalidraw" || !!(leaf.view as any)?.excalidrawWrapperRef;
    if (isExcalidraw) {
      console.log("[KCL-DEBUG] watchLeafIfExcalidraw: detected excalidraw leaf, viewType:", viewType);
      if (this.interceptor) this.interceptor.watchLeaf(leaf);
      if (this.sidebarEnhancer) this.sidebarEnhancer.watchLeaf(leaf);
    }
  }

  private onTextareaAttach(textarea: HTMLTextAreaElement, view: any): void {
    console.log("[KCL-DEBUG] onTextareaAttach, excalidrawSnippetsEnabled:", this.plugin.settings.excalidrawSnippetsEnabled, "engine exists:", !!this.snippetEngine);
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
   * If the just-finished text element's ENTIRE content is a single $...$ or $$...$$
   * block (e.g. typed via the "mk" snippet), auto-convert it to a rendered equation
   * image using the same ExcalidrawAutomate pipeline the "Edit LaTeX" modal uses --
   * there is no such conversion built into Excalidraw itself for plain text editing.
   */
  private async onTextareaBlurCommit(text: string, view: any): Promise<void> {
    const latex = extractFullMathBlock(text);
    if (!latex) return;

    const trimmedOriginal = text.trim();
    console.log("[KCL-DEBUG] onTextareaBlurCommit: detected full math block, latex=", latex);

    try {
      // Excalidraw commits the plain text element to the scene asynchronously right
      // after blur; give it a moment before we look for it and replace it.
      await delay(80);

      const win = window as any;
      if (typeof win.ExcalidrawAutomate?.getAPI !== "function") {
        console.warn("[KCL Excalidraw] ExcalidrawAutomate.getAPI not available -- cannot auto-render equation");
        return;
      }
      // Must be called as a method (not destructured) -- getAPI reads `this` internally.
      const ea = win.ExcalidrawAutomate.getAPI(view);
      if (!ea) return;

      const api = ea.getExcalidrawAPI?.() ?? view.excalidrawAPI;
      if (!api) return;

      const elements = api.getSceneElements();
      const candidates = elements.filter(
        (e: any) => e.type === "text" && !e.isDeleted && e.text === trimmedOriginal,
      );
      if (candidates.length === 0) {
        console.warn("[KCL Excalidraw] Could not find the committed text element to convert to an equation");
        return;
      }
      const textEl = candidates.reduce((best: any, cur: any) =>
        !best || (cur.updated ?? 0) > (best.updated ?? 0) ? cur : best,
      );

      // Delete the plain text element BEFORE adding the equation image, not after:
      // addElementsToView's "save" commits scene state asynchronously through
      // Excalidraw's own React update cycle, so reading getSceneElements() again
      // immediately afterward can race that commit and silently drop this deletion
      // (the equation appears, but the leftover raw-text element never gets removed).
      // Deleting first has no such race -- it's a single independent mutation that
      // addElementsToView's later read/merge will simply build on top of.
      const elementsWithTextDeleted = api.getSceneElements().map((e: any) =>
        e.id === textEl.id ? { ...e, isDeleted: true } : e,
      );
      api.updateScene({ elements: elementsWithTextDeleted });

      const elementId = await ea.addLaTex(textEl.x, textEl.y, latex, 1, 1);
      if (!elementId) {
        console.warn("[KCL Excalidraw] tex2dataURL failed -- MathJax (excalidraw-extras) may not be activated");
        return;
      }
      await ea.addElementsToView(false, true, false, false);
    } catch (e) {
      console.error("[KCL Excalidraw] Failed to auto-convert text to equation:", e);
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
