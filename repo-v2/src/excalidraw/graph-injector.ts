import type { TriggerMatch, KCLSettings } from "../types";
import type { ExpressionEngine } from "../engine";

export class GraphInjector {
  constructor(
    private engine: ExpressionEngine,
    private plugin: any,
    private settings: KCLSettings,
  ) {}

  async renderAndPlace(
    trigger: TriggerMatch,
    sourceElement: any,
    ea: any,
  ): Promise<boolean> {
    const mode = trigger.mode.includes(":") ? trigger.mode.split(":")[0] : trigger.mode;
    const specResult = this.engine.preparePlot(trigger.latex, mode);
    if (!specResult.ok) {
      console.warn("[KCL Excalidraw] Plot prep failed:", specResult.error);
      return false;
    }
    if (!specResult.value) {
      console.warn("[KCL Excalidraw] Plot prep failed: no plot spec returned for:", trigger.latex);
      return false;
    }

    let dataURL: string | null = null;
    const is3D = ["plot3d", "geometry", "tangent"].includes(mode);

    if (is3D) {
      dataURL = this.plugin.renderer3d.renderSnapshot(specResult.value);
    } else {
      dataURL = await this.render2DToImage(
        specResult.value,
        this.settings.excalidrawGraphWidth,
        this.settings.excalidrawGraphHeight,
      );
    }

    if (!dataURL) {
      console.warn("[KCL Excalidraw] Graph render failed for:", trigger.latex);
      return false;
    }

    return await this.placeImageOnCanvas(dataURL, sourceElement, ea, trigger);
  }

  private async render2DToImage(spec: any, width: number, height: number): Promise<string | null> {
    const container = document.createElement("div");
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    document.body.appendChild(container);

    try {
      this.plugin.renderer2d.create(container, spec, true);

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        }),
      );

      const canvas = container.querySelector("canvas");
      if (!canvas) return null;

      return canvas.toDataURL("image/png");
    } finally {
      container.remove();
    }
  }

  private async placeImageOnCanvas(
    dataURL: string,
    sourceElement: any,
    ea: any,
    trigger: TriggerMatch,
  ): Promise<boolean> {
    try {
      const fileId = `kcl-graph-${sourceElement.id}-${Date.now()}`;

      const existingGraphId = sourceElement.customData?.kclGraphId;
      if (existingGraphId) {
        await this.removeExistingGraph(existingGraphId, ea);
      }

      ea.imagesDict[fileId] = {
        mimeType: "image/png",
        id: fileId,
        dataURL,
        created: Date.now(),
      };

      const gap = 20;
      const x = sourceElement.x;
      const y = sourceElement.y + (sourceElement.height || 30) + gap;

      const api = ea.getExcalidrawAPI();
      if (!api) return false;

      const imageElement = {
        type: "image" as const,
        id: `kcl-img-${Date.now()}`,
        x,
        y,
        width: this.settings.excalidrawGraphWidth,
        height: this.settings.excalidrawGraphHeight,
        fileId,
        status: "saved",
        customData: {
          kclSourceId: sourceElement.id,
          kclTriggerMode: trigger.mode,
          kclLaTeX: trigger.latex,
        },
      };

      const elements = api.getSceneElements();
      api.updateScene({
        elements: [
          ...elements,
          {
            ...imageElement,
            version: 1,
            versionNonce: Math.floor(Math.random() * 1e9),
            isDeleted: false,
            fillStyle: "solid",
            strokeWidth: 0,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            angle: 0,
            strokeColor: "transparent",
            backgroundColor: "transparent",
            seed: Math.floor(Math.random() * 1e9),
            groupIds: [],
            frameId: null,
            roundness: null,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            scale: [1, 1],
          },
        ],
      });

      this.updateElementCustomData(
        sourceElement.id,
        {
          kclGraphId: imageElement.id,
        },
        api,
      );

      return true;
    } catch (e) {
      console.error("[KCL Excalidraw] Failed to place graph on canvas:", e);
      return false;
    }
  }

  private async removeExistingGraph(graphId: string, ea: any): Promise<void> {
    try {
      const api = ea.getExcalidrawAPI();
      if (!api) return;

      const elements = api.getSceneElements();
      const updated = elements.map((el: any) =>
        el.id === graphId ? { ...el, isDeleted: true } : el,
      );
      api.updateScene({ elements: updated });
    } catch {
      /* Silently fail */
    }
  }

  private updateElementCustomData(
    elementId: string,
    data: Record<string, any>,
    api: any,
  ): void {
    try {
      const elements = api.getSceneElements();
      const updated = elements.map((el: any) => {
        if (el.id === elementId) {
          return {
            ...el,
            customData: { ...(el.customData || {}), ...data },
          };
        }
        return el;
      });
      api.updateScene({ elements: updated });
    } catch {
      /* Non-critical failure */
    }
  }
}
