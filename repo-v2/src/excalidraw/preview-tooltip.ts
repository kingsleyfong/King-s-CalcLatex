import type { KCLSettings } from "../types";

export class PreviewTooltip {
  private tooltip: HTMLDivElement | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentLatex = "";
  private renderCache = new Map<string, any>();
  private cacheMaxSize = 150;

  constructor(private settings: KCLSettings) {}

  private setCache(latex: string, element: any): void {
    if (this.renderCache.size >= this.cacheMaxSize) {
      const oldestKey = this.renderCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.renderCache.delete(oldestKey);
      }
    }
    this.renderCache.set(latex, element);
  }

  create(): void {
    if (this.tooltip) return;

    this.tooltip = document.createElement("div");
    this.tooltip.className = "kcl-preview-tooltip";
    this.tooltip.style.display = "none";
    document.body.appendChild(this.tooltip);
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  update(
    text: string,
    textarea: HTMLTextAreaElement | HTMLInputElement,
    excalidrawView: any,
  ): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const cursor = textarea.selectionStart ?? text.length;
    const latex = this.extractLatexAtCursor(text, cursor);

    if (!latex) {
      this.hide();
      return;
    }

    if (this.renderCache.has(latex)) {
      this.renderPreview(text, textarea, excalidrawView);
    } else {
      this.debounceTimer = setTimeout(() => {
        this.renderPreview(text, textarea, excalidrawView);
      }, 100);
    }
  }

  hide(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.tooltip) {
      this.tooltip.style.display = "none";
    }
  }

  private async renderPreview(
    text: string,
    textarea: HTMLTextAreaElement | HTMLInputElement,
    excalidrawView: any,
  ): Promise<void> {
    if (!this.tooltip) return;

    const cursor = textarea.selectionStart ?? text.length;
    const latex = this.extractLatexAtCursor(text, cursor);
    if (!latex) {
      this.hide();
      return;
    }

    if (latex === this.currentLatex && this.tooltip.style.display === "block") {
      return;
    }
    this.currentLatex = latex;

    const svg = await this.renderLatexToSVG(latex, excalidrawView);
    if (!svg) {
      this.hide();
      return;
    }

    const rect = textarea.getBoundingClientRect();
    this.tooltip.innerHTML = "";
    this.tooltip.appendChild(svg);
    this.tooltip.style.display = "block";

    let left = rect.left;
    const tooltipWidth = this.tooltip.offsetWidth;
    if (left + tooltipWidth > window.innerWidth) {
      left = Math.max(8, window.innerWidth - tooltipWidth - 8);
    }
    this.tooltip.style.left = `${left}px`;

    const position = this.settings.excalidrawPreviewPosition || "below";
    if (position === "above") {
      this.tooltip.style.top = `${rect.top - this.tooltip.offsetHeight - 8}px`;
      if (this.tooltip.getBoundingClientRect().top < 0) {
        this.tooltip.style.top = `${rect.bottom + 8}px`;
      }
    } else {
      this.tooltip.style.top = `${rect.bottom + 8}px`;
      if (this.tooltip.getBoundingClientRect().bottom > window.innerHeight) {
        this.tooltip.style.top = `${rect.top - this.tooltip.offsetHeight - 8}px`;
      }
    }
  }

  private extractLatexAtCursor(text: string, cursorPos: number): string | null {
    let i = 0;
    let inMath = false;
    let isDisplay = false;
    let mathStartIdx = -1;

    while (i < text.length) {
      if (i === cursorPos) {
        if (!inMath) return null;
        let closeIdx = -1;
        let searchIdx = i;
        while (searchIdx < text.length) {
          if (text[searchIdx] === "$" && (searchIdx === 0 || text[searchIdx - 1] !== "\\")) {
            if (isDisplay && text[searchIdx + 1] === "$") {
              closeIdx = searchIdx;
              break;
            } else if (!isDisplay && text[searchIdx] === "$") {
              closeIdx = searchIdx;
              break;
            }
          }
          searchIdx++;
        }

        if (closeIdx !== -1) {
          return text.slice(mathStartIdx + (isDisplay ? 2 : 1), closeIdx).trim();
        } else {
          return text.slice(mathStartIdx + (isDisplay ? 2 : 1)).trim();
        }
      }

      if (text[i] === "$" && (i === 0 || text[i - 1] !== "\\")) {
        if (text[i + 1] === "$" && !inMath) {
          inMath = true;
          isDisplay = true;
          mathStartIdx = i;
          i += 2;
          continue;
        } else if (isDisplay && inMath && text[i + 1] === "$") {
          inMath = false;
          isDisplay = false;
          mathStartIdx = -1;
          i += 2;
          continue;
        } else if (!isDisplay) {
          inMath = !inMath;
          mathStartIdx = inMath ? i : -1;
          i++;
          continue;
        }
      }
      i++;
    }

    if (cursorPos >= text.length && inMath && mathStartIdx !== -1) {
      return text.slice(mathStartIdx + (isDisplay ? 2 : 1)).trim();
    }

    return null;
  }

  private async renderLatexToSVG(
    latex: string,
    excalidrawView: any,
  ): Promise<SVGElement | null> {
    if (this.renderCache.has(latex)) {
      const cached = this.renderCache.get(latex);
      if (cached) {
        return cached.cloneNode(true) as any;
      }
    }

    try {
      const plugin = excalidrawView?.plugin;
      const ea = plugin?.ea || (window as any).ExcalidrawAutomate;
      if (ea) {
        if (excalidrawView) ea.setView(excalidrawView);
        const res = await ea.tex2dataURL(latex);
        if (res?.dataURL) {
          const img = document.createElement("img");
          img.src = res.dataURL;
          img.style.maxWidth = "400px";
          img.style.maxHeight = "200px";
          this.setCache(latex, img);
          return img.cloneNode(true) as any;
        }
      }

      if ((window as any).MathJax?.tex2svg) {
        const node = (window as any).MathJax.tex2svg(latex);
        const svg = node.querySelector("svg");
        if (svg) {
          this.setCache(latex, svg);
          return svg.cloneNode(true) as any;
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}
