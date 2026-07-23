import { renderMath, finishRenderMath } from "obsidian";
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

function parseDocument(text: string): { color: string | null; box: BBoxOptions | null; content: string } {
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

function rebuildDocument(color: string | null, box: BBoxOptions | null, content: string): string {
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

      this.applyModalPosition(modalEl);

      // Excalidraw's modal is React-controlled and re-applies its own inline
      // position style on re-render (e.g. every keystroke in the equation editor),
      // silently undoing our one-time positioning above. Watch for that and
      // re-apply -- applyModalPosition() is itself guarded to no-op when the
      // target position hasn't changed, so this can't loop.
      const actualModalEl = (modalEl.closest(".modal") || modalEl) as HTMLElement;
      const modalPositionObserver = new MutationObserver(() => {
        this.applyModalPosition(modalEl);
      });
      modalPositionObserver.observe(actualModalEl, { attributes: true, attributeFilter: ["style", "class"] });

      if (!editorView) return;

      const initialText = editorView.state.doc.toString();

      this.injectLivePreview(modalEl, editorView);
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

        const left = Math.round(editorRect.left + (editorRect.width - tooltipRect.width) / 2);
        const top = Math.round(editorRect.top - tooltipRect.height - 12);

        const targetLeft = `${left}px`;
        const targetTop = `${top}px`;

        if (t.style.left === targetLeft && t.style.top === targetTop) return;

        t.style.setProperty("position", "fixed", "important");
        t.style.setProperty("left", targetLeft, "important");
        t.style.setProperty("top", targetTop, "important");
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
          modalPositionObserver.disconnect();
          removalObserver.disconnect();
        }
      });
      removalObserver.observe(container, { childList: true });
    }, 60);
  }

  private applyModalPosition(modalEl: HTMLElement): void {
    const pos = this.settings.latexModalPosition || "bottom";

    const actualModal = (modalEl.closest(".modal") || modalEl) as HTMLElement;
    const modalContainer = (modalEl.closest(".modal-container") || modalEl.parentElement) as HTMLElement;

    if (modalContainer) {
      modalContainer.style.setProperty("display", "flex", "important");
      modalContainer.style.setProperty("pointer-events", "none", "important");
      modalContainer.style.setProperty("z-index", "1000", "important");
    }

    const app = (window as any).app;
    const activeLeaf = app?.workspace?.activeLeaf;
    const leafEl = activeLeaf?.view?.contentEl as HTMLElement;

    // Guard against the continuous repositioning MutationObserver in enhanceModal()
    // looping forever: compare the ACTUAL live inline style values against the target
    // before writing (matching positionTooltip()'s pattern above). Keying this off
    // the leaf-rect-derived inputs instead (e.g. a cached signature of left/bottom)
    // would be wrong: the rect can stay identical between calls while Excalidraw's own
    // React re-render has *already* overwritten the inline style out from under us --
    // that case must still re-apply, which a rect-only comparison would incorrectly skip.
    const applyIfChanged = (props: Record<string, string>, write: () => void) => {
      const alreadyApplied = Object.entries(props).every(
        ([prop, value]) => actualModal.style.getPropertyValue(prop) === value,
      );
      if (alreadyApplied) return;
      write();
    };

    if (leafEl && (pos === "bottom" || pos === "cursor")) {
      const rect = leafEl.getBoundingClientRect();
      const left = `${Math.round(rect.left + rect.width / 2)}px`;
      const bottom = `${Math.max(20, Math.round(window.innerHeight - rect.bottom + 40))}px`;

      applyIfChanged({ bottom, left, top: "auto" }, () => {
        actualModal.style.setProperty("position", "fixed", "important");
        actualModal.style.setProperty("bottom", bottom, "important");
        actualModal.style.setProperty("top", "auto", "important");
        actualModal.style.setProperty("left", left, "important");
        actualModal.style.setProperty("transform", "translateX(-50%)", "important");
        actualModal.style.setProperty("margin", "0", "important");
        actualModal.style.setProperty("pointer-events", "auto", "important");
        actualModal.style.setProperty("box-shadow", "0 8px 32px rgba(0, 0, 0, 0.4)", "important");
      });
      return;
    }

    if (pos === "top" && leafEl) {
      const rect = leafEl.getBoundingClientRect();
      const left = `${Math.round(rect.left + rect.width / 2)}px`;
      const top = `${Math.round(rect.top + 60)}px`;

      applyIfChanged({ top, left, bottom: "auto" }, () => {
        actualModal.style.setProperty("position", "fixed", "important");
        actualModal.style.setProperty("top", top, "important");
        actualModal.style.setProperty("bottom", "auto", "important");
        actualModal.style.setProperty("left", left, "important");
        actualModal.style.setProperty("transform", "translateX(-50%)", "important");
        actualModal.style.setProperty("margin", "0", "important");
        actualModal.style.setProperty("pointer-events", "auto", "important");
      });
      return;
    }

    applyIfChanged({ top: "50%", left: "50%" }, () => {
      actualModal.style.setProperty("position", "fixed", "important");
      actualModal.style.setProperty("top", "50%", "important");
      actualModal.style.setProperty("left", "50%", "important");
      actualModal.style.setProperty("transform", "translate(-50%, -50%)", "important");
      actualModal.style.setProperty("margin", "0", "important");
      actualModal.style.setProperty("pointer-events", "auto", "important");
    });
  }

  private injectLivePreview(modalEl: HTMLElement, editorView: any): void {
    if (modalEl.querySelector(".kcl-latex-live-preview")) return;

    // Excalidraw only wires its own snippet/preview engine into this modal when it
    // detects the separate community "Latex Suite" plugin (app.plugins.plugins["latex-suite"]).
    // We deliberately don't spoof that plugin id -- an earlier attempt to do so broke
    // Excalidraw's right-click "Edit LaTeX", double-click editing, and Ctrl+\ shortcut
    // entirely, because Excalidraw calls methods on that plugin expecting the real
    // plugin's API shape. Instead, we hide its "install Latex Suite" suggestion and
    // provide equivalent live preview ourselves via Obsidian's own renderMath API.
    const suggestion = modalEl.querySelector(".excalidraw-latex-suite-suggestion");
    if (suggestion instanceof HTMLElement) {
      suggestion.style.display = "none";
    }

    const cmEditor = modalEl.querySelector(".cm-editor");
    if (!cmEditor?.parentElement) return;

    const preview = document.createElement("div");
    preview.className = "kcl-latex-live-preview";
    cmEditor.parentElement.insertBefore(preview, cmEditor.nextSibling);

    const update = () => {
      const text = editorView.state.doc.toString().trim();
      preview.innerHTML = "";
      if (!text) return;
      try {
        const rendered = renderMath(text, true);
        preview.appendChild(rendered);
        void finishRenderMath();
      } catch {
        /* Invalid/incomplete LaTeX while typing -- leave preview blank rather than erroring. */
      }
    };

    update();

    const cmContent = modalEl.querySelector(".cm-content");
    if (cmContent) {
      cmContent.addEventListener("keyup", update);
      cmContent.addEventListener("input", update);
    }
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

        const newText = rebuildDocument(color.latex, parsed.box, parsed.content);
        const cursor = getUpdatedCursor(currentText, newText, parsed.content, parsed.content, currentCursor);

        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: newText },
          selection: { anchor: cursor, head: cursor },
        });

        refreshActiveState();

        const syncFn = (modalEl as any)._kclSyncUI;
        if (syncFn) syncFn();

        editorView.focus();
      };

      dotsContainer.appendChild(dot);
    }

    const clearDot = document.createElement("div");
    clearDot.className = "kcl-latex-color-clear";
    clearDot.textContent = "×";
    clearDot.title = "Clear Color";
    clearDot.onclick = () => {
      const currentText = editorView.state.doc.toString();
      const parsed = parseDocument(currentText);
      const currentCursor = editorView.state.selection.main.head;

      const newText = rebuildDocument(null, parsed.box, parsed.content);
      const cursor = getUpdatedCursor(currentText, newText, parsed.content, parsed.content, currentCursor);

      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: newText },
        selection: { anchor: cursor, head: cursor },
      });

      refreshActiveState();

      const syncFn = (modalEl as any)._kclSyncUI;
      if (syncFn) syncFn();

      editorView.focus();
    };
    colorBar.appendChild(clearDot);

    buttonBar.parentNode?.insertBefore(colorBar, buttonBar);

    refreshActiveState();

    const cmContent = modalEl.querySelector(".cm-content");
    if (cmContent) {
      cmContent.addEventListener("keyup", refreshActiveState);
      cmContent.addEventListener("input", refreshActiveState);
    }
  }

  private injectBoxPanel(modalEl: HTMLElement, editorView: any): void {
    if (modalEl.querySelector(".kcl-latex-box-panel")) return;

    const buttonBar = modalEl.querySelector(".excalidraw-prompt-buttonbar-bottom");
    if (!buttonBar) return;

    const boxPanel = document.createElement("div");
    boxPanel.className = "kcl-latex-box-panel";

    const toggleRow = document.createElement("div");
    toggleRow.className = "kcl-latex-box-toggle-row";

    const toggleLabel = document.createElement("span");
    toggleLabel.className = "kcl-latex-box-toggle-label";
    toggleLabel.textContent = "Box Equation:";
    toggleRow.appendChild(toggleLabel);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "kcl-latex-box-toggle-btn";
    toggleBtn.title = "Toggle Border Box";
    toggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      </svg>
    `;
    toggleRow.appendChild(toggleBtn);
    boxPanel.appendChild(toggleRow);

    const settingsGrid = document.createElement("div");
    settingsGrid.className = "kcl-latex-box-settings-grid";
    boxPanel.appendChild(settingsGrid);

    const createSettingsRow = (labelText: string, contentEl: HTMLElement) => {
      const row = document.createElement("div");
      row.className = "kcl-latex-box-row";
      const label = document.createElement("span");
      label.className = "kcl-latex-box-row-label";
      label.textContent = labelText;
      row.appendChild(label);
      row.appendChild(contentEl);
      return row;
    };

    const borderColorContainer = document.createElement("div");
    borderColorContainer.className = "kcl-border-colors-container";

    const syncDot = document.createElement("div");
    syncDot.className = "kcl-latex-border-color-dot is-sync";
    syncDot.setAttribute("data-color", "sync");
    syncDot.title = "Sync with Text Color";
    syncDot.innerHTML = `
      <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="3" fill="none">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
      </svg>
    `;
    borderColorContainer.appendChild(syncDot);

    for (const color of COMMON_COLORS) {
      const dot = document.createElement("div");
      dot.className = "kcl-latex-border-color-dot";
      dot.style.backgroundColor = color.hex;
      dot.setAttribute("data-color", color.latex);
      dot.title = `Border: ${color.name}`;
      borderColorContainer.appendChild(dot);
    }
    settingsGrid.appendChild(createSettingsRow("Border Color:", borderColorContainer));

    // Valid MathJax background color specifications (rgba format prevents blackbox rendering bug)
    const bgColors = [
      { name: "Transparent", mathjax: "transparent", displayHex: "transparent" },
      { name: "Soft Yellow", mathjax: "rgba(254,202,87,0.22)", displayHex: "#feca57" },
      { name: "Soft Red", mathjax: "rgba(255,77,77,0.22)", displayHex: "#ff4d4d" },
      { name: "Soft Green", mathjax: "rgba(29,209,161,0.22)", displayHex: "#1dd1a1" },
      { name: "Soft Blue", mathjax: "rgba(84,160,255,0.22)", displayHex: "#54a0ff" },
      { name: "Soft Purple", mathjax: "rgba(95,39,205,0.22)", displayHex: "#5f27cd" },
      { name: "Soft Gray", mathjax: "rgba(136,136,136,0.22)", displayHex: "#888888" },
    ];

    const bgContainer = document.createElement("div");
    bgContainer.className = "kcl-bg-colors-container";

    for (const bg of bgColors) {
      const dot = document.createElement("div");
      dot.className = `kcl-latex-bg-dot${bg.mathjax === "transparent" ? " is-clear" : ""}`;
      if (bg.mathjax !== "transparent") {
        dot.style.backgroundColor = bg.displayHex;
      }
      dot.setAttribute("data-color", bg.mathjax);
      dot.title = `Fill: ${bg.name}`;
      bgContainer.appendChild(dot);
    }
    settingsGrid.appendChild(createSettingsRow("Background:", bgContainer));

    const thicknessContainer = document.createElement("div");
    thicknessContainer.className = "kcl-button-group kcl-thickness-group";
    ["1px", "1.5px", "2px", "3px"].forEach((val) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kcl-btn";
      btn.setAttribute("data-value", val);
      btn.textContent = val;
      thicknessContainer.appendChild(btn);
    });
    settingsGrid.appendChild(createSettingsRow("Thickness:", thicknessContainer));

    const styleContainer = document.createElement("div");
    styleContainer.className = "kcl-button-group kcl-style-group";
    ["solid", "dashed", "dotted"].forEach((val) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kcl-btn";
      btn.setAttribute("data-value", val);
      btn.textContent = val;
      styleContainer.appendChild(btn);
    });
    settingsGrid.appendChild(createSettingsRow("Style:", styleContainer));

    const paddingContainer = document.createElement("div");
    paddingContainer.className = "kcl-button-group kcl-padding-group";
    ["2px", "4px", "6px", "8px"].forEach((val) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kcl-btn";
      btn.setAttribute("data-value", val);
      btn.textContent = val;
      paddingContainer.appendChild(btn);
    });
    settingsGrid.appendChild(createSettingsRow("Padding:", paddingContainer));

    const syncModalUI = () => {
      const text = editorView.state.doc.toString();
      const parsed = parseDocument(text);

      if (parsed.box && parsed.box.enabled) {
        toggleBtn.classList.add("is-active");
        settingsGrid.style.display = "flex";

        const currentBorderColor = parsed.box.borderColor || "sync";
        borderColorContainer.querySelectorAll(".kcl-latex-border-color-dot").forEach((dot) => {
          if (dot.getAttribute("data-color") === currentBorderColor) {
            dot.classList.add("is-active");
          } else {
            dot.classList.remove("is-active");
          }
        });

        const currentBg = parsed.box.background || "transparent";
        bgContainer.querySelectorAll(".kcl-latex-bg-dot").forEach((dot) => {
          const attr = dot.getAttribute("data-color");
          if (attr === currentBg || (currentBg === "transparent" && attr === "transparent")) {
            dot.classList.add("is-active");
          } else {
            dot.classList.remove("is-active");
          }
        });

        const currentThickness = parsed.box.borderThickness || "1.5px";
        thicknessContainer.querySelectorAll(".kcl-btn").forEach((btn) => {
          if (btn.getAttribute("data-value") === currentThickness) {
            btn.classList.add("is-active");
          } else {
            btn.classList.remove("is-active");
          }
        });

        const currentStyle = parsed.box.borderStyle || "solid";
        styleContainer.querySelectorAll(".kcl-btn").forEach((btn) => {
          if (btn.getAttribute("data-value") === currentStyle) {
            btn.classList.add("is-active");
          } else {
            btn.classList.remove("is-active");
          }
        });

        const currentPadding = parsed.box.padding || "6px";
        paddingContainer.querySelectorAll(".kcl-btn").forEach((btn) => {
          if (btn.getAttribute("data-value") === currentPadding) {
            btn.classList.add("is-active");
          } else {
            btn.classList.remove("is-active");
          }
        });
      } else {
        toggleBtn.classList.remove("is-active");
        settingsGrid.style.display = "none";
      }
    };

    (modalEl as any)._kclSyncUI = syncModalUI;

    const applyBoxChange = (mutator: (opts: BBoxOptions) => void) => {
      const currentText = editorView.state.doc.toString();
      const parsed = parseDocument(currentText);
      const currentCursor = editorView.state.selection.main.head;

      let boxOpts: BBoxOptions = parsed.box || {
        enabled: true,
        padding: "6px",
        borderThickness: "1.5px",
        borderStyle: "solid",
        borderColor: "sync",
        background: "transparent",
      };

      mutator(boxOpts);

      const newText = rebuildDocument(parsed.color, boxOpts, parsed.content);
      const cursor = getUpdatedCursor(currentText, newText, parsed.content, parsed.content, currentCursor);

      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: newText },
        selection: { anchor: cursor, head: cursor },
      });

      syncModalUI();
      editorView.focus();
    };

    toggleBtn.onclick = () => {
      const currentText = editorView.state.doc.toString();
      const parsed = parseDocument(currentText);

      if (parsed.box && parsed.box.enabled) {
        applyBoxChange((opts) => {
          opts.enabled = false;
        });
      } else {
        applyBoxChange((opts) => {
          opts.enabled = true;
        });
      }
    };

    borderColorContainer.addEventListener("click", (e) => {
      const dot = (e.target as HTMLElement).closest(".kcl-latex-border-color-dot");
      if (!dot) return;
      const color = dot.getAttribute("data-color");
      if (!color) return;
      applyBoxChange((opts) => {
        opts.borderColor = color;
      });
    });

    bgContainer.addEventListener("click", (e) => {
      const dot = (e.target as HTMLElement).closest(".kcl-latex-bg-dot");
      if (!dot) return;
      const color = dot.getAttribute("data-color");
      if (!color) return;
      applyBoxChange((opts) => {
        opts.background = color;
      });
    });

    thicknessContainer.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(".kcl-btn");
      if (!btn) return;
      const val = btn.getAttribute("data-value");
      if (!val) return;
      applyBoxChange((opts) => {
        opts.borderThickness = val;
      });
    });

    styleContainer.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(".kcl-btn");
      if (!btn) return;
      const val = btn.getAttribute("data-value");
      if (!val) return;
      applyBoxChange((opts) => {
        opts.borderStyle = val;
      });
    });

    paddingContainer.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(".kcl-btn");
      if (!btn) return;
      const val = btn.getAttribute("data-value");
      if (!val) return;
      applyBoxChange((opts) => {
        opts.padding = val;
      });
    });

    buttonBar.parentNode?.insertBefore(boxPanel, buttonBar);

    syncModalUI();

    const cmContent = modalEl.querySelector(".cm-content");
    if (cmContent) {
      cmContent.addEventListener("keyup", syncModalUI);
      cmContent.addEventListener("input", syncModalUI);
    }
  }

  private setupAutoSave(modalEl: HTMLElement, initialText: string): void {
    const cmContent = modalEl.querySelector(".cm-content");
    const editorView = (cmContent as any)?.cmView?.view;

    const commitAndClose = () => {
      if (!editorView || !document.contains(modalEl)) return;
      const currentText = editorView.state.doc.toString();
      if (currentText !== initialText) {
        const okButton = modalEl.querySelector(
          ".excalidraw-prompt-buttonbar-bottom button.mod-cta",
        ) as HTMLButtonElement;
        if (okButton) {
          okButton.click();
          return;
        }
      } else {
        const cancelButton = modalEl.querySelector(
          ".modal-close-button, .excalidraw-prompt-buttonbar-bottom button:not(.mod-cta)",
        ) as HTMLButtonElement;
        if (cancelButton) {
          cancelButton.click();
          return;
        }
        const modalContainer = modalEl.closest(".modal-container");
        if (modalContainer) modalContainer.remove();
      }
    };

    const handleGlobalClick = (e: MouseEvent) => {
      if (!document.contains(modalEl)) {
        window.removeEventListener("pointerdown", handleGlobalClick, true);
        return;
      }
      if (!modalEl.contains(e.target as Node)) {
        commitAndClose();
      }
    };
    window.addEventListener("pointerdown", handleGlobalClick, true);

    const handleKeydown = (e: KeyboardEvent) => {
      if (!document.contains(modalEl)) {
        window.removeEventListener("keydown", handleKeydown, true);
        return;
      }
      if (e.key === "Escape") {
        window.removeEventListener("keydown", handleKeydown, true);
        commitAndClose();
      }
    };
    window.addEventListener("keydown", handleKeydown, true);
  }
}
