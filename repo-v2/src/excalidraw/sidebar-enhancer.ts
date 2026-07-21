import { WorkspaceLeaf } from "obsidian";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SidebarStyleEnhancer {
  private observers = new Map<WorkspaceLeaf, MutationObserver>();

  constructor(private plugin: any) {}

  watchLeaf(leaf: WorkspaceLeaf) {
    if (this.observers.has(leaf)) return;

    const view = leaf.view as any;
    const container = this.getExcalidrawContainer(view);
    if (!container) return;

    let frameRequested = false;
    const observer = new MutationObserver(() => {
      if (frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(() => {
        this.checkAndEnhance(container, view);
        frameRequested = false;
      });
    });

    observer.observe(container, { childList: true, subtree: true });
    this.observers.set(leaf, observer);

    this.checkAndEnhance(container, view);
  }

  unwatchLeaf(leaf: WorkspaceLeaf) {
    const observer = this.observers.get(leaf);
    if (observer) {
      observer.disconnect();
      this.observers.delete(leaf);
    }
  }

  destroy() {
    for (const [, observer] of this.observers) {
      observer.disconnect();
    }
    this.observers.clear();
  }

  private getExcalidrawContainer(view: any): HTMLElement | null {
    try {
      if (view.excalidrawWrapperRef?.current) {
        return view.excalidrawWrapperRef.current as HTMLElement;
      }
      if (view.excalidrawContainer) {
        return view.excalidrawContainer as HTMLElement;
      }
      if (view.contentEl) {
        return (
          view.contentEl.querySelector(".excalidraw-wrapper") ||
          view.contentEl.querySelector(".excalidraw") ||
          view.contentEl
        );
      }
    } catch {}
    return null;
  }

  private checkAndEnhance(container: HTMLElement, view: any) {
    const api = this.getExcalidrawAPI(view);
    if (!api) return;

    this.syncUnderlineProperties(api);

    const panel = container.querySelector(".selected-shape-actions");
    if (!panel) return;

    const panelColumn = panel.querySelector(".panelColumn");
    if (!panelColumn) return;

    if (panelColumn.querySelector(".kcl-text-styles-container")) return;

    const selectedElements = api
      .getSceneElements()
      .filter(
        (el: any) => !el.isDeleted && api.getAppState().selectedElementIds[el.id],
      );

    const hasTextSelected = selectedElements.some((el: any) => el.type === "text");
    if (!hasTextSelected) return;

    let targetRow: HTMLElement | null = null;
    const headers = panelColumn.querySelectorAll("h3, legend, .control-label");
    for (const h of headers) {
      const text = h.textContent?.trim().toLowerCase();
      if (
        text === "font family" ||
        text === "font size" ||
        text === "text align"
      ) {
        targetRow =
          h.closest("div") || h.closest("fieldset") || (h.parentElement as HTMLElement);
        break;
      }
    }

    if (!targetRow) return;

    const stylesRow = document.createElement("div");
    stylesRow.className = "kcl-text-styles-container";

    const isUnderlined = selectedElements.some(
      (el: any) => el.type === "text" && el.customData?.kclUnderlineLineId,
    );

    stylesRow.innerHTML = `
			<h3 class="control-label">Text Styles</h3>
			<div class="buttonList">
				<button type="button" class="kcl-underline-btn ${isUnderlined ? "is-active" : ""}" title="Underline">
					<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
						<path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6 -6V3"></path>
						<line x1="4" y1="21" x2="20" y2="21"></line>
					</svg>
				</button>
			</div>
		`;

    const btn = stylesRow.querySelector(".kcl-underline-btn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleUnderline(view);
      });
    }

    targetRow.insertAdjacentElement("afterend", stylesRow);
  }

  private getExcalidrawAPI(view: any): any {
    try {
      if (view.excalidrawAPI) return view.excalidrawAPI;
      if (view.ea?.getExcalidrawAPI) return view.ea.getExcalidrawAPI();
      const ea = (window as any).ExcalidrawAutomate;
      if (ea?.getExcalidrawAPI) return ea.getExcalidrawAPI();
    } catch {
      /* Fallback */
    }
    return null;
  }

  async toggleUnderline(view: any) {
    const api = this.getExcalidrawAPI(view);
    if (!api) return;

    const elements = api.getSceneElements() as any[];
    const selectedElements = elements.filter(
      (el: any) =>
        el.type === "text" &&
        !el.isDeleted &&
        api.getAppState().selectedElementIds[el.id],
    );

    if (selectedElements.length === 0) return;

    let updatedElements = [...elements];
    const elementsToAdd: any[] = [];
    const idsToRemove = new Set<string>();

    for (const textEl of selectedElements) {
      const existingLineId = textEl.customData?.kclUnderlineLineId;
      let lineEl = existingLineId
        ? elements.find((el: any) => el.id === existingLineId)
        : null;

      if (lineEl && lineEl.isDeleted) {
        lineEl = null;
      }

      if (lineEl) {
        idsToRemove.add(existingLineId);

        updatedElements = updatedElements.map((el: any) => {
          if (el.id === textEl.id) {
            const nextGroupIds = (el.groupIds || []).filter(
              (gId: string) => gId !== lineEl.groupIds?.[0],
            );
            return {
              ...el,
              groupIds: nextGroupIds,
              customData: {
                ...(el.customData || {}),
                kclUnderlineLineId: undefined,
              },
            };
          }
          return el;
        });
      } else {
        const lineId = `kcl-line-${textEl.id}-${Date.now()}`;
        const groupId =
          textEl.groupIds && textEl.groupIds.length > 0
            ? textEl.groupIds[0]
            : `kcl-group-${textEl.id}-${Date.now()}`;

        const cx = textEl.x + textEl.width / 2;
        const cy = textEl.y + textEl.height / 2;

        const localCX = 0;
        const localCY = textEl.height / 2 + 4;

        const cos = Math.cos(textEl.angle);
        const sin = Math.sin(textEl.angle);
        const rotatedCX = localCX * cos - localCY * sin;
        const rotatedCY = localCX * sin + localCY * cos;

        const globalLineCX = cx + rotatedCX;
        const globalLineCY = cy + rotatedCY;

        const lineX = globalLineCX - textEl.width / 2;
        const lineY = globalLineCY;

        const newLineEl = {
          type: "line",
          id: lineId,
          x: lineX,
          y: lineY,
          width: textEl.width,
          height: 0,
          angle: textEl.angle,
          strokeColor: textEl.strokeColor,
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: textEl.fontSize > 30 ? 2 : 1.5,
          strokeStyle: "solid",
          roughness: textEl.roughness,
          opacity: textEl.opacity,
          seed: Math.floor(Math.random() * 1e9),
          version: 1,
          versionNonce: Math.floor(Math.random() * 1e9),
          isDeleted: false,
          groupIds: [groupId],
          frameId: textEl.frameId,
          roundness: null,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
          points: [
            [0, 0],
            [textEl.width, 0],
          ],
          customData: {
            kclUnderlineForTextId: textEl.id,
          },
        };

        elementsToAdd.push(newLineEl);

        updatedElements = updatedElements.map((el: any) => {
          if (el.id === textEl.id) {
            return {
              ...el,
              groupIds:
                el.groupIds && el.groupIds.includes(groupId)
                  ? el.groupIds
                  : [...(el.groupIds || []), groupId],
              customData: {
                ...(el.customData || {}),
                kclUnderlineLineId: lineId,
              },
            };
          }
          return el;
        });
      }
    }

    updatedElements = updatedElements.map((el: any) => {
      if (idsToRemove.has(el.id)) {
        return { ...el, isDeleted: true };
      }
      return el;
    });

    updatedElements.push(...elementsToAdd);

    api.updateScene({ elements: updatedElements });
    api.refresh();
  }

  async updateUnderlineIfPresent(view: any, textVal: string, elementId?: string) {
    const api = this.getExcalidrawAPI(view);
    if (!api) return;

    await sleep(50);

    const elements = api.getSceneElements();
    let textEl = null;
    if (elementId) {
      textEl = elements.find((el: any) => el.id === elementId && !el.isDeleted);
    }
    if (!textEl) {
      textEl = elements.find(
        (el: any) => el.type === "text" && !el.isDeleted && el.text === textVal,
      );
    }
    if (!textEl) {
      textEl = elements.find(
        (el: any) =>
          el.type === "text" && !el.isDeleted && el.customData?.kclUnderlineLineId,
      );
    }
    if (!textEl || !textEl.customData?.kclUnderlineLineId) return;

    const lineId = textEl.customData.kclUnderlineLineId;
    const lineEl = elements.find((el: any) => el.id === lineId);
    if (!lineEl || lineEl.isDeleted) return;

    const cx = textEl.x + textEl.width / 2;
    const cy = textEl.y + textEl.height / 2;

    const localCX = 0;
    const localCY = textEl.height / 2 + 4;

    const cos = Math.cos(textEl.angle);
    const sin = Math.sin(textEl.angle);
    const rotatedCX = localCX * cos - localCY * sin;
    const rotatedCY = localCX * sin + localCY * cos;

    const globalLineCX = cx + rotatedCX;
    const globalLineCY = cy + rotatedCY;

    const lineX = globalLineCX - textEl.width / 2;
    const lineY = globalLineCY;

    const updatedElements = elements.map((el: any) => {
      if (el.id === lineId) {
        return {
          ...el,
          x: lineX,
          y: lineY,
          width: textEl.width,
          angle: textEl.angle,
          points: [
            [0, 0],
            [textEl.width, 0],
          ],
          strokeColor: textEl.strokeColor,
          opacity: textEl.opacity,
          roughness: textEl.roughness,
          strokeWidth: textEl.fontSize > 30 ? 2 : 1.5,
        };
      }
      return el;
    });

    api.updateScene({ elements: updatedElements });
  }

  private syncUnderlineProperties(api: any) {
    const allElements = api.getSceneElements();
    let needsSync = false;

    const updatedElements = allElements.map((el: any) => {
      if (
        el.type === "line" &&
        !el.isDeleted &&
        el.customData?.kclUnderlineForTextId
      ) {
        const textId = el.customData.kclUnderlineForTextId;
        const textEl = allElements.find((t: any) => t.id === textId);
        if (!textEl || textEl.isDeleted) {
          needsSync = true;
          return { ...el, isDeleted: true };
        }

        const strokeWidth = textEl.fontSize > 30 ? 2 : 1.5;
        if (
          el.strokeColor !== textEl.strokeColor ||
          el.opacity !== textEl.opacity ||
          el.roughness !== textEl.roughness ||
          el.strokeWidth !== strokeWidth ||
          el.angle !== textEl.angle ||
          el.width !== textEl.width
        ) {
          needsSync = true;

          const cx = textEl.x + textEl.width / 2;
          const cy = textEl.y + textEl.height / 2;
          const localCX = 0;
          const localCY = textEl.height / 2 + 4;
          const cos = Math.cos(textEl.angle);
          const sin = Math.sin(textEl.angle);
          const rotatedCX = localCX * cos - localCY * sin;
          const rotatedCY = localCX * sin + localCY * cos;
          const globalLineCX = cx + rotatedCX;
          const globalLineCY = cy + rotatedCY;
          const lineX = globalLineCX - textEl.width / 2;
          const lineY = globalLineCY;

          return {
            ...el,
            x: lineX,
            y: lineY,
            width: textEl.width,
            angle: textEl.angle,
            points: [
              [0, 0],
              [textEl.width, 0],
            ],
            strokeColor: textEl.strokeColor,
            opacity: textEl.opacity,
            roughness: textEl.roughness,
            strokeWidth: strokeWidth,
          };
        }
      }
      return el;
    });

    if (needsSync) {
      api.updateScene({ elements: updatedElements });
    }
  }
}
