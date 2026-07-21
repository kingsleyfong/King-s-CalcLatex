import type { KCLSettings } from "../types";

const COMMON_COLORS = [
  { name: "red", hex: "#ff4d4d", latex: "red" },
  { name: "orange", hex: "#ff9f43", latex: "orange" },
  { name: "yellow", hex: "#feca57", latex: "yellow" },
  { name: "green", hex: "#1dd1a1", latex: "green" },
  { name: "blue", hex: "#54a0ff", latex: "blue" },
  { name: "purple", hex: "#5f27cd", latex: "purple" },
  { name: "pink", hex: "#ff9ff3", latex: "pink" },
  { name: "cyan", hex: "#00d2d3", latex: "cyan" },
];

export interface BBoxOptions {
  enabled: boolean;
  padding?: string;
  background?: string;
  borderThickness?: string;
  borderStyle?: string;
  borderColor?: string;
}

function getOuterBBox(text: string): { options: string; content: string } | null {
  const match = text.match(/^\\bbox\[([^\]]*)\]\{/);
  if (!match) return null;

  const options = match[1];
  const startIndex = match[0].length;

  let depth = 1;
  let i = startIndex;
  while (i < text.length && depth > 0) {
    if (text[i] === "{") {
      depth++;
    } else if (text[i] === "}") {
      depth--;
    }
    i++;
  }

  if (depth === 0 && i === text.length) {
    const content = text.slice(startIndex, text.length - 1);
    return { options, content };
  }

  return null;
}

function parseBBoxOptions(optionsStr: string): BBoxOptions {
  const opts: BBoxOptions = {
    enabled: true,
    padding: "6px",
    borderThickness: "1.5px",
    borderStyle: "solid",
    borderColor: "sync",
    background: "transparent",
  };

  const parts = optionsStr.split(",").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith("border:")) {
      const spec = part.replace(/^border:\s*/, "").trim();
      const borderParts = spec.split(/\s+/);
      for (const bp of borderParts) {
        if (/^\d+(\.\d+)?(px|em|pt)$/.test(bp)) {
          opts.borderThickness = bp;
        } else if (["solid", "dashed", "dotted"].includes(bp)) {
          opts.borderStyle = bp;
        } else {
          opts.borderColor = bp;
        }
      }
    } else if (/^\d+(\.\d+)?(px|em|pt)$/.test(part)) {
      opts.padding = part;
    } else {
      opts.background = part;
    }
  }
  return opts;
}

function buildBBox(content: string, opts: BBoxOptions): string {
  if (!opts.enabled) return content;
  const parts: string[] = [];
  if (opts.background && opts.background !== "transparent") {
    parts.push(opts.background);
  }
  if (opts.padding && opts.padding !== "0px") {
    parts.push(opts.padding);
  }

  const borderParts: string[] = [];
  if (opts.borderThickness) borderParts.push(opts.borderThickness);
  if (opts.borderStyle) borderParts.push(opts.borderStyle);
  if (opts.borderColor && opts.borderColor !== "sync") {
    borderParts.push(opts.borderColor);
  }

  if (borderParts.length > 0) {
    parts.push(`border: ${borderParts.join(" ")}`);
  }

  return `\\bbox[${parts.join(", ")}]{${content}}`;
}

function parseDocument(text: string): {
  color: string | null;
  box: BBoxOptions | null;
  content: string;
} {
  let color: string | null = null;
  let content = text.trim();

  const colorRegex = /^\\color\{([^}]+)\}\s*/;
  const colorMatch = content.match(colorRegex);
  if (colorMatch) {
    color = colorMatch[1];
    content = content.slice(colorMatch[0].length).trim();
  }

  const box = getOuterBBox(content);
  if (box) {
    return {
      color,
      box: parseBBoxOptions(box.options),
      content: box.content,
    };
  } else {
    return {
      color,
      box: null,
      content,
    };
  }
}

function rebuildDocument(
  color: string | null,
  box: BBoxOptions | null,
  content: string,
): string {
  let result = content;
  if (box && box.enabled) {
    result = buildBBox(result, box);
  }
  if (color) {
    result = `\\color{${color}} ${result}`;
  }
  return result;
}

function getUpdatedCursor(
  oldText: string,
  newText: string,
  oldContent: string,
  newContent: string,
  currentCursor: number,
): number {
  const oldContentIndex = oldText.indexOf(oldContent);
  const newContentIndex = newText.indexOf(newContent);

  if (oldContentIndex === -1 || newContentIndex === -1) {
    return newText.length;
  }

  if (currentCursor < oldContentIndex) {
    return Math.min(newContentIndex, currentCursor);
  } else if (currentCursor > oldContentIndex + oldContent.length) {
    const offsetFromEnd = oldText.length - currentCursor;
    return Math.max(newContentIndex + newContent.length, newText.length - offsetFromEnd);
  } else {
    const relativeOffset = currentCursor - oldContentIndex;
    return newContentIndex + relativeOffset;
  }
}

/**
 * Intercepts and enhances Excalidraw's native LaTeX prompt modal window,
 * implementing custom position setting (defaulting to bottom of screen).
 */
export class LaTexModalEnhancer {
  private observer: MutationObserver | null = null;
  private modalObserver: MutationObserver | null = null;

  constructor(private settings: KCLSettings) {}

  start(): void {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const node = m.addedNodes[i];
          if (node instanceof HTMLElement) {
            if (node.classList.contains("modal-container")) {
              this.watchModalContainer(node);
            } else {
              this.checkForModal(node);
            }
          }
        }
        for (let i = 0; i < m.removedNodes.length; i++) {
          const node = m.removedNodes[i];
          if (node instanceof HTMLElement && node.classList.contains("modal-container")) {
            this.unwatchModalContainer();
          }
        }
      }
    });

    this.observer.observe(document.body, { childList: true, subtree: false });

    const existingContainer = document.querySelector(".modal-container") as HTMLElement;
    if (existingContainer) {
      this.watchModalContainer(existingContainer);
    }
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.unwatchModalContainer();
  }

  private watchModalContainer(container: HTMLElement): void {
    this.unwatchModalContainer();
    this.checkForModal(container);

    this.modalObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const node = m.addedNodes[i];
          if (node instanceof HTMLElement) {
            this.checkForModal(node);
          }
        }
      }
    });
    this.modalObserver.observe(container, { childList: true, subtree: true });
  }

  private unwatchModalContainer(): void {
    if (this.modalObserver) {
      this.modalObserver.disconnect();
      this.modalObserver = null;
    }
  }

  private checkForModal(node: HTMLElement): void {
    const modalEl = node.classList.contains("excalidraw-LatexPrompt")
      ? node
      : (node.querySelector(".excalidraw-LatexPrompt") as HTMLElement);

    if (modalEl) {
      this.enhanceModal(modalEl);
    }
  }

  private enhanceModal(modalEl: HTMLElement): void {
    setTimeout(() => {
      const cmContent = modalEl.querySelector(".cm-content");
      const editorView = (cmContent as any)?.cmView?.view;

      // Apply modal positioning according to user settings (bottom default)
      this.applyModalPosition(modalEl);

      if (!editorView) return;

      const initialText = editorView.state.doc.toString();

      this.injectColorBar(modalEl, editorView);
      this.injectBoxPanel(modalEl, editorView);
      this.setupAutoSave(modalEl, initialText);

      const activeTooltips = new Set<HTMLElement>();
      const attrObservers: MutationObserver[] = [];

      const positionTooltip = (t: HTMLElement) => {
        const cmEditor = modalEl.querySelector(".cm-editor");
        if (!cmEditor) return;
        const editorRect = cmEditor.getBoundingClientRect();
        const tooltipRect = t.getBoundingClientRect();

        const left = editorRect.left + (editorRect.width - tooltipRect.width) / 2;
        const top = editorRect.top - tooltipRect.height - 12;

        t.style.setProperty("position", "fixed", "important");
        t.style.setProperty("left", `${left}px`, "important");
        t.style.setProperty("top", `${top}px`, "important");
        t.style.setProperty("transform", "none", "important");
      };

      const tooltipObserver = new MutationObserver(() => {
        const tooltips = document.querySelectorAll(".cm-tooltip");
        tooltips.forEach((t) => {
          if (t instanceof HTMLElement) {
            positionTooltip(t);

            if (!activeTooltips.has(t)) {
              activeTooltips.add(t);

              const attrObserver = new MutationObserver(() => {
                if (document.contains(t)) {
                  positionTooltip(t);
                } else {
                  attrObserver.disconnect();
                  activeTooltips.delete(t);
                  const index = attrObservers.indexOf(attrObserver);
                  if (index > -1) attrObservers.splice(index, 1);
                }
              });
              attrObserver.observe(t, { attributes: true, attributeFilter: ["style", "class"] });
              attrObservers.push(attrObserver);
            }
          }
        });
      });
      tooltipObserver.observe(document.body, { childList: true, subtree: true });

      const container = modalEl.parentElement || document.body;
      const removalObserver = new MutationObserver(() => {
        if (!document.contains(modalEl)) {
          tooltipObserver.disconnect();
          attrObservers.forEach((obs) => obs.disconnect());
          removalObserver.disconnect();
        }
      });
      removalObserver.observe(container, { childList: true });
    }, 60);
  }

  /**
   * Position the Excalidraw LaTeX prompt modal dynamically based on setting.
   * Modifies the outer .modal-container to keep all modal elements (title, input, color bar, buttons)
   * as a single unified window.
   */
  private applyModalPosition(modalEl: HTMLElement): void {
    const pos = this.settings.latexModalPosition || "bottom";

    const modalContainer = (modalEl.closest(".modal-container") || modalEl.parentElement) as HTMLElement;
    const actualModal = (modalEl.closest(".modal") || modalEl) as HTMLElement;

    if (modalContainer) {
      modalContainer.classList.remove(
        "kcl-modal-container-bottom",
        "kcl-modal-container-top",
        "kcl-modal-container-center",
        "kcl-modal-container-cursor",
      );
      modalContainer.classList.add(`kcl-modal-container-${pos}`);
    }

    // Reset inline overrides on inner elements so flex container rules apply cleanly
    actualModal.style.top = "";
    actualModal.style.bottom = "";
    actualModal.style.transform = "";
    actualModal.style.position = "";
    modalEl.style.top = "";
    modalEl.style.bottom = "";
    modalEl.style.transform = "";
    modalEl.style.position = "";
  }

  private injectColorBar(modalEl: HTMLElement, editorView: any): void {
    if (modalEl.querySelector(".kcl-latex-color-bar")) return;

    const buttonBar = modalEl.querySelector(".excalidraw-prompt-buttonbar-bottom");
    if (!buttonBar) return;

    const colorBar = document.createElement("div");
    colorBar.className = "kcl-latex-color-bar";

    const label = document.createElement("span");
    label.className = "kcl-latex-color-bar-label";
    label.textContent = "Color:";
    colorBar.appendChild(label);

    const dotsContainer = document.createElement("div");
    dotsContainer.style.display = "flex";
    dotsContainer.style.gap = "8px";
    colorBar.appendChild(dotsContainer);

    const refreshActiveState = () => {
      const text = editorView.state.doc.toString();
      const parsed = parseDocument(text);

      dotsContainer.querySelectorAll(".kcl-latex-color-dot").forEach((dot) => {
        const c = dot.getAttribute("data-color");
        if (c === parsed.color) {
          dot.classList.add("is-active");
        } else {
          dot.classList.remove("is-active");
        }
      });
    };

    for (const color of COMMON_COLORS) {
      const dot = document.createElement("div");
      dot.className = "kcl-latex-color-dot";
      dot.style.backgroundColor = color.hex;
      dot.setAttribute("data-color", color.latex);
      dot.title = `Prepend \\color{${color.latex}}`;

      dot.onclick = () => {
        const currentText = editorView.state.doc.toString();
        const parsed = parseDocument(currentText);
        const currentCursor = editorView.state.selection.main.head;

        const newText = this.applyColor(currentText, color.latex);
        const cursor = getUpdatedCursor(currentText, newText, parsed.content, parsed.content, currentCursor);

        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: newText },
          selection: { anchor: cursor, head: cursor },
        });

        refreshActiveState();
      };
      dotsContainer.appendChild(dot);
    }

    buttonBar.parentElement?.insertBefore(colorBar, buttonBar);
    refreshActiveState();
  }

  private applyColor(text: string, newColor: string): string {
    const parsed = parseDocument(text);
    const targetColor = parsed.color === newColor ? null : newColor;
    return rebuildDocument(targetColor, parsed.box, parsed.content);
  }

  private injectBoxPanel(modalEl: HTMLElement, editorView: any): void {
    if (modalEl.querySelector(".kcl-latex-box-panel")) return;
    const buttonBar = modalEl.querySelector(".excalidraw-prompt-buttonbar-bottom");
    if (!buttonBar) return;

    const panel = document.createElement("div");
    panel.className = "kcl-latex-box-panel";
    panel.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:6px;font-size:12px;";

    const label = document.createElement("span");
    label.textContent = "Box:";
    panel.appendChild(label);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.textContent = "Add \\bbox";
    toggleBtn.className = "kcl-box-toggle-btn";

    toggleBtn.onclick = () => {
      const currentText = editorView.state.doc.toString();
      const parsed = parseDocument(currentText);
      const currentCursor = editorView.state.selection.main.head;

      let newBox: BBoxOptions | null = null;
      if (!parsed.box || !parsed.box.enabled) {
        newBox = {
          enabled: true,
          padding: "6px",
          borderThickness: "1.5px",
          borderStyle: "solid",
          borderColor: "sync",
          background: "transparent",
        };
      }
      const newText = rebuildDocument(parsed.color, newBox, parsed.content);
      const cursor = getUpdatedCursor(currentText, newText, parsed.content, parsed.content, currentCursor);

      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: newText },
        selection: { anchor: cursor, head: cursor },
      });
    };

    panel.appendChild(toggleBtn);
    buttonBar.parentElement?.insertBefore(panel, buttonBar);
  }

  private setupAutoSave(modalEl: HTMLElement, initialText: string): void {
    const closeBtn = modalEl.querySelector(".modal-close-button");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this.triggerSave(modalEl);
      });
    }
  }

  private triggerSave(modalEl: HTMLElement): void {
    const submitBtn = modalEl.querySelector(".excalidraw-prompt-buttonbar-bottom button:last-child") as HTMLButtonElement;
    if (submitBtn) {
      submitBtn.click();
    }
  }
}
