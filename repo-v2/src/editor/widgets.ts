/**
 * King's CalcLatex v2 — CM6 Widget Classes
 *
 * Thin wrappers that create container DOM elements and delegate all
 * computation to the engine and all rendering to the renderer modules.
 *
 * CRITICAL RULES:
 * - Widgets do NOT contain rendering logic.
 * - eq() must return true for identical expressions (prevents DOM recreation).
 * - destroy() must clean up renderer handles (prevents WebGL leaks).
 * - NO iframes. NO innerHTML with HTML blobs.
 * - Evaluation fires in toDOM(), NEVER in the constructor.
 *
 * WEBGL LIFECYCLE (3D only — Static Image Architecture):
 *   All 3D graphs are rendered as static <img> snapshots. Zero persistent
 *   WebGL contexts. The snapshot renderer creates a context for ~20ms per
 *   graph, then destroys it immediately.
 *
 *   Clicking a graph enters interactive mode: exactly 1 live WebGL context
 *   with OrbitControls. Only one graph can be interactive at a time.
 */

import { WidgetType } from "@codemirror/view";
import { renderMath, finishRenderMath } from "obsidian";
import type { TriggerMatch, GraphHandle, PlotSpec } from "../types";
import { COLORS } from "../renderer/colors";

// ══════════════════════════════════════════════════════════════
//  MODULE-LEVEL: Track the single interactive 3D widget
// ══════════════════════════════════════════════════════════════

let _activeInteractive3D: Graph3DWidget | null = null;

// ══════════════════════════════════════════════════════════════
//  SLIDER ANIMATION STATE
// ══════════════════════════════════════════════════════════════

interface SliderAnimState {
  playing: boolean;
  direction: 1 | -1;
  rafId: number | null;
  lastFrame: number;
}

// ══════════════════════════════════════════════════════════════
//  SHARED: Graph Toolbar (Fullscreen + Screenshot)
// ══════════════════════════════════════════════════════════════

async function captureToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) throw new Error("Canvas toBlob returned null");
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);
}

function showToast(container: HTMLElement, text: string, className: string): void {
  const toast = document.createElement("div");
  toast.className = className;
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add("kcl-fading"), 800);
  setTimeout(() => toast.remove(), 1500);
}

function addGraphToolbar(
  container: HTMLElement,
  getCanvas: () => HTMLCanvasElement | null,
  onResize?: () => void,
): { destroy: () => void } {
  const toolbar = document.createElement("div");
  toolbar.className = "kcl-graph-toolbar";

  const downloadBtn = document.createElement("button");
  downloadBtn.textContent = "\u2913"; // ⤓
  downloadBtn.title = "Save as PNG";
  downloadBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const canvas = getCanvas();
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );
      if (!blob) throw new Error("Canvas toBlob returned null");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "kcl-graph.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(container, "Saved!", "kcl-graph-copied-toast");
    } catch (err) {
      showToast(container, "Save failed", "kcl-graph-copied-toast");
      console.warn("[KCL] Graph download failed:", err);
    }
  });
  toolbar.appendChild(downloadBtn);

  const screenshotBtn = document.createElement("button");
  screenshotBtn.textContent = "\uD83D\uDCF7";
  screenshotBtn.title = "Copy screenshot to clipboard";
  screenshotBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const canvas = getCanvas();
    if (!canvas) return;
    try {
      await captureToClipboard(canvas);
      showToast(container, "Copied!", "kcl-graph-copied-toast");
    } catch (err) {
      showToast(container, "Copy failed", "kcl-graph-copied-toast");
      console.warn("[KCL] Screenshot copy failed:", err);
    }
  });
  toolbar.appendChild(screenshotBtn);

  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.textContent = "\u2922";
  fullscreenBtn.title = "Toggle fullscreen";

  function onFullscreenChange(): void {
    const isFs = document.fullscreenElement === container;
    container.classList.toggle("kcl-graph-fullscreen", isFs);
    fullscreenBtn.textContent = isFs ? "\u2716" : "\u2922";
    if (!isFs) {
      container.querySelectorAll(".kcl-graph-fullscreen-hint").forEach((el) => el.remove());
    }
    onResize?.();
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);

  fullscreenBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (document.fullscreenElement === container) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen().then(() => {
        const hint = document.createElement("div");
        hint.className = "kcl-graph-fullscreen-hint";
        hint.textContent = "Press Esc to exit fullscreen";
        container.appendChild(hint);
        setTimeout(() => hint.classList.add("kcl-fading"), 1500);
        setTimeout(() => hint.remove(), 2200);
      }).catch(() => {});
    }
  });
  toolbar.appendChild(fullscreenBtn);

  container.appendChild(toolbar);

  return {
    destroy(): void {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement === container) {
        document.exitFullscreen().catch(() => {});
      }
      toolbar.remove();
    },
  };
}

// ══════════════════════════════════════════════════════════════
//  SHARED: Parameter Sliders with Animation (DRY helper)
// ══════════════════════════════════════════════════════════════

interface SliderCallbacks {
  onValuesChanged: (values: Record<string, number>) => void;
}

function addSliders(
  wrapper: HTMLElement,
  spec: PlotSpec,
  plugin: any,
  callbacks: SliderCallbacks,
): { destroy: () => void } {
  // Remove existing slider container if present
  const existing = wrapper.querySelector(".kcl-slider-container");
  if (existing) existing.remove();

  const sliderContainer = document.createElement("div");
  sliderContainer.className = "kcl-slider-container";

  const varValues: Record<string, number> = {};
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const animStates: SliderAnimState[] = [];
  const animCleanups: (() => void)[] = [];

  for (const varName of spec.freeVars) {
    varValues[varName] = 1;

    const row = document.createElement("div");
    row.className = "kcl-slider-row";

    // Play/pause button
    const playBtn = document.createElement("button");
    playBtn.className = "kcl-slider-play";
    playBtn.textContent = "\u25B6"; // ▶
    playBtn.title = "Animate slider";

    const animState: SliderAnimState = {
      playing: false,
      direction: 1,
      rafId: null,
      lastFrame: 0,
    };
    animStates.push(animState);

    const label = document.createElement("span");
    label.className = "kcl-slider-label";
    label.textContent = varName;

    const input = document.createElement("input");
    input.className = "kcl-slider-input";
    input.type = "range";
    input.min = "-10";
    input.max = "10";
    input.step = "0.1";
    input.value = "1";

    const valueDisplay = document.createElement("span");
    valueDisplay.className = "kcl-slider-value";
    valueDisplay.textContent = "1.0";

    function updateFromSlider(): void {
      const val = parseFloat(input.value);
      varValues[varName] = val;
      valueDisplay.textContent = val.toFixed(1);

      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        // Use setVariable for direct numeric assignment (bypasses LaTeX parsing)
        for (const [name, v] of Object.entries(varValues)) {
          plugin.engine.setVariable(name, v);
        }
        callbacks.onValuesChanged(varValues);
      }, 50);
    }

    input.addEventListener("input", updateFromSlider);

    const minInput = document.createElement("input");
    minInput.type = "number";
    minInput.className = "kcl-slider-bound";
    minInput.value = "-10";
    minInput.step = "any";
    minInput.addEventListener("change", () => {
      const newMin = parseFloat(minInput.value);
      if (!isFinite(newMin) || newMin >= parseFloat(maxInput.value)) return;
      input.min = String(newMin);
      input.step = String((parseFloat(input.max) - newMin) / 200);
      if (parseFloat(input.value) < newMin) {
        input.value = String(newMin);
        updateFromSlider();
      }
    });

    const maxInput = document.createElement("input");
    maxInput.type = "number";
    maxInput.className = "kcl-slider-bound";
    maxInput.value = "10";
    maxInput.step = "any";
    maxInput.addEventListener("change", () => {
      const newMax = parseFloat(maxInput.value);
      if (!isFinite(newMax) || newMax <= parseFloat(minInput.value)) return;
      input.max = String(newMax);
      input.step = String((newMax - parseFloat(input.min)) / 200);
      if (parseFloat(input.value) > newMax) {
        input.value = String(newMax);
        updateFromSlider();
      }
    });

    // Animation loop
    let animThrottleAccum = 0;
    const ANIM_FRAME_INTERVAL = 1000 / 30; // ~30fps throttle

    function animLoop(timestamp: number): void {
      if (!animState.playing) return;
      animState.rafId = requestAnimationFrame(animLoop);

      const dt = animState.lastFrame > 0 ? timestamp - animState.lastFrame : 16;
      animState.lastFrame = timestamp;
      animThrottleAccum += dt;

      if (animThrottleAccum < ANIM_FRAME_INTERVAL) return;
      animThrottleAccum = 0;

      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      const range = max - min;
      // Traverse full range in ~4 seconds
      const speed = range / 4000;
      let val = parseFloat(input.value) + animState.direction * speed * dt;

      // Bounce at boundaries
      if (val >= max) { val = max; animState.direction = -1; }
      if (val <= min) { val = min; animState.direction = 1; }

      input.value = String(val);
      updateFromSlider();
    }

    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      animState.playing = !animState.playing;
      playBtn.textContent = animState.playing ? "\u23F8" : "\u25B6"; // ⏸ or ▶

      if (animState.playing) {
        animState.lastFrame = 0;
        animThrottleAccum = 0;
        animState.rafId = requestAnimationFrame(animLoop);
      } else if (animState.rafId !== null) {
        cancelAnimationFrame(animState.rafId);
        animState.rafId = null;
      }
    });

    animCleanups.push(() => {
      animState.playing = false;
      if (animState.rafId !== null) {
        cancelAnimationFrame(animState.rafId);
        animState.rafId = null;
      }
    });

    // ── Record / Export button ─────────────────────────────────────
    const recordBtn = document.createElement("button");
    recordBtn.className = "kcl-slider-record";
    recordBtn.textContent = "\u23FA"; // ⏺
    recordBtn.title = "Export animation as WebM";

    let _mrec: MediaRecorder | null = null;
    let _mrecTimeout: ReturnType<typeof setTimeout> | null = null;
    let _wasPlaying = false;

    function _stopRecord(): void {
      if (_mrecTimeout !== null) { clearTimeout(_mrecTimeout); _mrecTimeout = null; }
      if (_mrec && _mrec.state !== "inactive") _mrec.stop();
    }

    recordBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Stop if already recording
      if (_mrec && _mrec.state !== "inactive") { _stopRecord(); return; }
      const canvas = wrapper.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas) return; // 3D static mode — no live canvas; user must enter interactive mode first
      if (typeof MediaRecorder === "undefined") return;
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9" : "video/webm";
      const stream = canvas.captureStream(30);
      _mrec = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      _mrec.ondataavailable = (ev: BlobEvent) => { if (ev.data.size > 0) chunks.push(ev.data); };
      _mrec.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kcl-${varName}-anim.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        _mrec = null;
        recordBtn.classList.remove("recording");
        recordBtn.textContent = "\u23FA";
        recordBtn.title = "Export animation as WebM";
        // Stop animation if it wasn't running before we started recording
        if (!_wasPlaying && animState.playing) {
          animState.playing = false;
          playBtn.textContent = "\u25B6";
          if (animState.rafId !== null) { cancelAnimationFrame(animState.rafId); animState.rafId = null; }
        }
      };
      // Reset slider to start, force forward direction
      input.value = input.min;
      animState.direction = 1;
      animThrottleAccum = 0;
      updateFromSlider();
      // Ensure animation is running
      _wasPlaying = animState.playing;
      if (!animState.playing) {
        animState.playing = true;
        animState.lastFrame = 0;
        animThrottleAccum = 0;
        playBtn.textContent = "\u23F8"; // ⏸
        animState.rafId = requestAnimationFrame(animLoop);
      }
      recordBtn.classList.add("recording");
      recordBtn.textContent = "\u23F9"; // ⏹
      recordBtn.title = "Stop recording";
      _mrec.start(100); // collect blobs every 100 ms
      // Auto-stop after one full pass (min → max = 4 s, matching animLoop speed)
      _mrecTimeout = setTimeout(_stopRecord, 4000);
    });

    animCleanups.push(_stopRecord);

    row.appendChild(playBtn);
    row.appendChild(recordBtn);
    row.appendChild(label);
    row.appendChild(minInput);
    row.appendChild(input);
    row.appendChild(maxInput);
    row.appendChild(valueDisplay);
    sliderContainer.appendChild(row);
  }

  wrapper.appendChild(sliderContainer);

  return {
    destroy(): void {
      for (const cleanup of animCleanups) cleanup();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      sliderContainer.remove();
    },
  };
}

// ══════════════════════════════════════════════════════════════
//  RESULT WIDGET — Inline evaluation result (=, \approx, \equiv)
// ══════════════════════════════════════════════════════════════

export class ResultWidget extends WidgetType {
  private readonly latex: string;
  private readonly mode: string;
  private readonly plugin: any;

  constructor(plugin: any, trigger: TriggerMatch) {
    super();
    this.plugin = plugin;
    this.latex = trigger.latex;
    this.mode = trigger.mode;
  }

  eq(other: ResultWidget): boolean {
    return this.latex === other.latex && this.mode === other.mode;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "kcl-result";
    span.textContent = "\u2026";

    Promise.resolve().then(async () => {
      try {
        if (this.mode.startsWith("convert:")) {
          const targetUnit = this.mode.slice("convert:".length).trim();
          const cleanLatex = this.latex
            .replace(/\\text\{([^}]+)\}/g, "$1")
            .replace(/\\mathrm\{([^}]+)\}/g, "$1")
            .replace(/\\si\{([^}]+)\}/g, "$1")
            .replace(/\\operatorname\{([^}]+)\}/g, "$1")
            .replace(/\\/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          const numMatch = cleanLatex.match(
            /^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(.*)$/
          );
          if (numMatch) {
            const value = parseFloat(numMatch[1]);
            const sourceUnit = numMatch[2].trim();
            const result = this.plugin.engine.convert(value, sourceUnit, targetUnit);
            if (result.ok) {
              span.textContent = ` = ${result.value}`;
              span.classList.add("kcl-result--ok");
            } else {
              span.textContent = ` Unit error`;
              span.title = result.error;
              span.classList.add("kcl-result--error");
            }
          } else {
            span.textContent = ` Parse error`;
            span.title = `Could not extract value from: ${this.latex}`;
            span.classList.add("kcl-result--error");
          }
          return;
        }

        const result = await this.plugin.engine.evaluate(this.latex, this.mode);
        if (result.ok) {
          span.textContent = ` ${result.value.text}`;
          span.title = result.value.latex;
          span.classList.add("kcl-result--ok");
        } else {
          span.textContent = ` Error`;
          span.title = result.error;
          span.classList.add("kcl-result--error");
        }
      } catch (e) {
        span.textContent = ` Error`;
        span.title = String(e);
        span.classList.add("kcl-result--error");
      }
    });

    return span;
  }

  get estimatedHeight(): number {
    return -1;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  GRAPH 2D WIDGET
// ══════════════════════════════════════════════════════════════

export class Graph2DWidget extends WidgetType {
  private readonly latex: string;
  private readonly mode: string;
  private readonly plugin: any;
  private handle: GraphHandle | null = null;
  private toolbarHandle: { destroy: () => void } | null = null;
  private sliderHandle: { destroy: () => void } | null = null;
  private destroyed = false;

  constructor(plugin: any, trigger: TriggerMatch) {
    super();
    this.plugin = plugin;
    this.latex = trigger.latex;
    this.mode = trigger.mode;
  }

  eq(other: Graph2DWidget): boolean {
    return this.latex === other.latex && this.mode === other.mode;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "kcl-graph-wrapper";

    const container = document.createElement("div");
    container.className = "kcl-graph-2d";
    wrapper.appendChild(container);

    this.destroyed = false;
    if (this.handle) { this.handle.destroy(); this.handle = null; }
    if (this.toolbarHandle) { this.toolbarHandle.destroy(); this.toolbarHandle = null; }
    if (this.sliderHandle) { this.sliderHandle.destroy(); this.sliderHandle = null; }

    this.toolbarHandle = addGraphToolbar(
      container,
      () => container.querySelector("canvas"),
      () => {
        requestAnimationFrame(() => {
          container.style.display = "none";
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          container.offsetHeight;
          container.style.display = "";
        });
      },
    );

    // Callback fired by renderer2d whenever it (re)builds the label DOM elements.
    // Called only on spec change — never on pan/zoom frames — so MathJax nodes survive.
    const onLabelsBuilt = (els: HTMLElement[]) => {
      let didRender = false;
      for (const el of els) {
        const latex = el.dataset.latex;
        if (!latex) continue; // plain-text label (e.g. scatter dataset, regression eq)
        el.textContent = "";
        try {
          el.appendChild(renderMath(latex, false));
          didRender = true;
        } catch {
          el.textContent = latex;
        }
      }
      if (didRender) {
        try { finishRenderMath(); } catch { /* non-critical */ }
      }
    };

    Promise.resolve().then(async () => {
      try {
        const specResult = await this.plugin.engine.preparePlot(this.latex, this.mode);
        if (this.destroyed) return;
        if (specResult.ok) {
          const showPOIs = this.plugin.settings?.showPOIs ?? true;
          this.handle = await this.plugin.renderer2d.create(
            container, specResult.value, showPOIs, onLabelsBuilt,
          );
          if (this.destroyed) {
            this.handle?.destroy?.();
            this.handle = null;
            return;
          }

          this.plugin.publishInspectorState?.({
            spec: specResult.value,
            latex: this.latex,
            title: this.latex,
            summary: `2D plot · ${specResult.value.data[0]?.type ?? ""}`,
            diagnostics: (specResult.diagnostics ?? []).map((d: any) => d.message),
          });

          if (specResult.value.freeVars.length > 0) {
            this.sliderHandle = addSliders(wrapper, specResult.value, this.plugin, {
              onValuesChanged: () => {
                const newResult = this.plugin.engine.preparePlot(this.latex, this.mode);
                if (newResult.ok && this.handle) {
                  this.handle.update(newResult.value);
                }
              },
            });
          }
        } else {
          container.textContent = `Plot error: ${specResult.error}`;
          container.classList.add("kcl-graph--error");
        }
      } catch (e) {
        container.textContent = `Plot error: ${String(e)}`;
        container.classList.add("kcl-graph--error");
      }
    });

    return wrapper;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.sliderHandle) { this.sliderHandle.destroy(); this.sliderHandle = null; }
    if (this.toolbarHandle) { this.toolbarHandle.destroy(); this.toolbarHandle = null; }
    if (this.handle) { this.handle.destroy(); this.handle = null; }
  }

  get estimatedHeight(): number {
    return 300;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// ══════════════════════════════════════════════════════════════
//  GRAPH 3D WIDGET — Static Image + Click-to-Interact
// ══════════════════════════════════════════════════════════════

export class Graph3DWidget extends WidgetType {
  private readonly latex: string;
  private readonly mode: string;
  private readonly plugin: any;

  private wrapper: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private handle: GraphHandle | null = null;
  private toolbarHandle: { destroy: () => void } | null = null;
  private sliderHandle: { destroy: () => void } | null = null;
  private destroyed = false;
  private cachedSpec: PlotSpec | null = null;
  private snapshotUrl: string = "";

  constructor(plugin: any, trigger: TriggerMatch) {
    super();
    this.plugin = plugin;
    this.latex = trigger.latex;
    this.mode = trigger.mode;
  }

  eq(other: Graph3DWidget): boolean {
    return this.latex === other.latex && this.mode === other.mode;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "kcl-graph-wrapper";
    this.wrapper = wrapper;

    const container = document.createElement("div");
    container.className = "kcl-graph-3d";
    this.container = container;
    wrapper.appendChild(container);

    this.destroyed = false;
    if (this.handle) { this.handle.destroy(); this.handle = null; }
    if (this.toolbarHandle) { this.toolbarHandle.destroy(); this.toolbarHandle = null; }
    if (this.sliderHandle) { this.sliderHandle.destroy(); this.sliderHandle = null; }

    if (this.snapshotUrl) {
      this._showSnapshot();
      if (this.cachedSpec && this.cachedSpec.freeVars.length > 0) {
        this._attachSliders();
      }
    } else {
      const loading = document.createElement("div");
      loading.className = "kcl-graph-loading";
      loading.textContent = "Rendering 3D graph\u2026";
      container.appendChild(loading);

      Promise.resolve().then(() => {
        if (this.destroyed) return;
        this._renderInitialSnapshot();
      });
    }

    container.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList?.contains("kcl-graph-3d-close")) return;
      if (target.closest(".kcl-graph-toolbar")) return;
      this._enterInteractive();
    });

    return wrapper;
  }

  private _renderInitialSnapshot(): void {
    if (!this.container || this.destroyed) return;
    try {
      const specResult = this.plugin.engine.preparePlot(this.latex, this.mode);
      if (!specResult.ok) {
        this.container.textContent = `3D plot error: ${specResult.error}`;
        this.container.classList.add("kcl-graph--error");
        return;
      }
      this.cachedSpec = specResult.value;
      this.snapshotUrl = this.plugin.renderer3d.renderSnapshot(this.cachedSpec);
      this._showSnapshot();

      this.plugin.publishInspectorState?.({
        spec: this.cachedSpec,
        latex: this.latex,
        title: this.latex,
        summary: `3D plot · ${this.cachedSpec.data[0]?.type ?? ""}`,
        diagnostics: [],
      });

      if (this.wrapper && this.cachedSpec.freeVars.length > 0) {
        this._attachSliders();
      }
    } catch (e) {
      if (this.container) {
        this.container.textContent = `3D plot error: ${String(e)}`;
        this.container.classList.add("kcl-graph--error");
      }
    }
  }

  private _showSnapshot(): void {
    if (!this.container || !this.snapshotUrl || this.destroyed) return;

    if (this.toolbarHandle) { this.toolbarHandle.destroy(); this.toolbarHandle = null; }

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    const img = document.createElement("img");
    img.src = this.snapshotUrl;
    img.className = "kcl-graph-3d-snapshot";
    img.draggable = false;
    this.container.appendChild(img);

    // Expression labels on snapshot — rendered as formatted math via Obsidian MathJax
    if (this.cachedSpec) {
      const labelOverlay = document.createElement("div");
      labelOverlay.className = "kcl-graph-3d-labels";
      let didRender3d = false;
      for (let i = 0; i < this.cachedSpec.data.length; i++) {
        const pd = this.cachedSpec.data[i];
        const color = pd.color || COLORS[i % COLORS.length];
        const lbl = document.createElement("div");
        lbl.className = "kcl-graph-3d-label";
        lbl.style.color = color;
        // Use plain-text label for dataset/scatter types; strip ALL trigger suffixes otherwise
        const cleanLatex = pd.label ?? pd.latex.replace(/@\w+.*$/i, "").trim();
        if (pd.label) {
          lbl.textContent = cleanLatex; // plain text (e.g. regression equation)
        } else {
          try {
            lbl.appendChild(renderMath(cleanLatex, false));
            didRender3d = true;
          } catch {
            lbl.textContent = cleanLatex;
          }
        }
        labelOverlay.appendChild(lbl);
      }
      // Call finishRenderMath once after all labels — not inside the loop
      if (didRender3d) {
        try { finishRenderMath(); } catch { /* non-critical */ }
      }
      this.container.appendChild(labelOverlay);
    }

    const hint = document.createElement("div");
    hint.className = "kcl-graph-3d-hint";
    hint.textContent = "Click to interact";
    this.container.appendChild(hint);

    const container = this.container;
    this.toolbarHandle = addGraphToolbar(
      container,
      () => {
        const canvas = container.querySelector("canvas");
        if (canvas) return canvas;
        const imgEl = container.querySelector("img.kcl-graph-3d-snapshot") as HTMLImageElement | null;
        if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
          const offscreen = document.createElement("canvas");
          offscreen.width = imgEl.naturalWidth;
          offscreen.height = imgEl.naturalHeight;
          const ctx = offscreen.getContext("2d");
          if (ctx) { ctx.drawImage(imgEl, 0, 0); return offscreen; }
        }
        return null;
      },
      () => {
        if (this.handle?.resize) {
          requestAnimationFrame(() => {
            if (!this.container) return;
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            if (w > 0 && h > 0) this.handle?.resize?.(w, h);
          });
        }
      },
    );
  }

  private _attachSliders(): void {
    if (!this.wrapper || !this.cachedSpec) return;
    if (this.sliderHandle) { this.sliderHandle.destroy(); this.sliderHandle = null; }

    this.sliderHandle = addSliders(this.wrapper, this.cachedSpec, this.plugin, {
      onValuesChanged: () => {
        const newResult = this.plugin.engine.preparePlot(this.latex, this.mode);
        if (!newResult.ok) return;
        this.cachedSpec = newResult.value;

        if (this.handle) {
          this.handle.update(newResult.value);
        } else {
          this.snapshotUrl = this.plugin.renderer3d.renderSnapshot(newResult.value);
          this._showSnapshot();
        }
      },
    });
  }

  _enterInteractive(): void {
    if (this.destroyed || !this.container || !this.cachedSpec) return;
    if (this.handle) return;

    if (_activeInteractive3D && _activeInteractive3D !== this) {
      _activeInteractive3D._exitInteractive();
    }
    _activeInteractive3D = this;

    if (this.toolbarHandle) { this.toolbarHandle.destroy(); this.toolbarHandle = null; }

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    try {
      this.handle = this.plugin.renderer3d.create(this.container, this.cachedSpec);

      // Post-process 3D label overlay with MathJax (renderer3d has no Obsidian API access)
      const label3dEls = this.container.querySelectorAll<HTMLElement>(".kcl-graph-3d-label[data-latex]");
      let didRender3dInteractive = false;
      label3dEls.forEach(el => {
        const latex = el.dataset.latex;
        if (!latex) return;
        el.textContent = "";
        try {
          el.appendChild(renderMath(latex, false));
          didRender3dInteractive = true;
        } catch {
          el.textContent = latex;
        }
      });
      if (didRender3dInteractive) {
        try { finishRenderMath(); } catch { /* non-critical */ }
      }

      const closeBtn = document.createElement("button");
      closeBtn.className = "kcl-graph-3d-close";
      closeBtn.textContent = "\u00d7";
      closeBtn.title = "Exit interactive mode";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._exitInteractive();
      });
      this.container.appendChild(closeBtn);

      const container = this.container;
      this.toolbarHandle = addGraphToolbar(
        container,
        () => container.querySelector("canvas"),
        () => {
          if (this.handle?.resize) {
            requestAnimationFrame(() => {
              if (!this.container) return;
              const w = this.container.clientWidth;
              const h = this.container.clientHeight;
              if (w > 0 && h > 0) this.handle?.resize?.(w, h);
            });
          }
        },
      );
    } catch (e) {
      if (this.container) {
        this.container.textContent = `3D plot error: ${String(e)}`;
        this.container.classList.add("kcl-graph--error");
      }
    }
  }

  _exitInteractive(): void {
    if (!this.handle || !this.container) return;

    const canvas = this.container.querySelector("canvas");
    if (canvas) {
      try { this.snapshotUrl = canvas.toDataURL("image/png"); }
      catch { /* keep old snapshot */ }
    }

    this.handle.destroy();
    this.handle = null;

    if (_activeInteractive3D === this) _activeInteractive3D = null;
    this._showSnapshot();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.sliderHandle) { this.sliderHandle.destroy(); this.sliderHandle = null; }
    if (this.toolbarHandle) { this.toolbarHandle.destroy(); this.toolbarHandle = null; }
    if (this.handle) { this.handle.destroy(); this.handle = null; }
    if (_activeInteractive3D === this) _activeInteractive3D = null;
    this.container = null;
    this.wrapper = null;
  }

  get estimatedHeight(): number {
    return 400;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// ══════════════════════════════════════════════════════════════
//  TABLE WIDGET — Renders (x,y) data as an HTML table
// ══════════════════════════════════════════════════════════════

/** Parse numeric (x,y) pairs from a LaTeX string — local copy for widget use. */
function _parseDataPoints(latex: string): [number, number][] {
  const pts: [number, number][] = [];
  const re = /\(\s*(-?[\d.]+(?:[eE][+-]?\d+)?)\s*,\s*(-?[\d.]+(?:[eE][+-]?\d+)?)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latex)) !== null) {
    const x = parseFloat(m[1]);
    const y = parseFloat(m[2]);
    if (isFinite(x) && isFinite(y)) pts.push([x, y]);
  }
  return pts;
}

export class TableWidget extends WidgetType {
  private readonly latex: string;
  private readonly plugin: any;
  private destroyed = false;

  constructor(plugin: any, trigger: TriggerMatch) {
    super();
    this.plugin = plugin;
    this.latex = trigger.latex;
  }

  eq(other: TableWidget): boolean {
    return this.latex === other.latex;
  }

  toDOM(): HTMLElement {
    this.destroyed = false;
    const wrapper = document.createElement("div");
    wrapper.className = "kcl-table-widget";

    const pts = _parseDataPoints(this.latex);
    if (pts.length === 0) {
      wrapper.textContent = "⚠ No data points found (format: (x1,y1);(x2,y2);...)";
      wrapper.classList.add("kcl-table-error");
      return wrapper;
    }

    // ── Summary bar ──────────────────────────────────────────────
    const summary = document.createElement("div");
    summary.className = "kcl-table-summary";
    summary.textContent = `${pts.length} data points`;

    // Compute basic stats
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    const fmt = (n: number) => parseFloat(n.toPrecision(5)).toString();
    summary.textContent = `n=${pts.length}  x̄=${fmt(meanX)}  ȳ=${fmt(meanY)}`;
    wrapper.appendChild(summary);

    // ── Table ─────────────────────────────────────────────────────
    const table = document.createElement("table");
    table.className = "kcl-table";

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const h of ["n", "x", "y"]) {
      const th = document.createElement("th");
      th.textContent = h;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const tr = document.createElement("tr");
      for (const v of [i + 1, x, y]) {
        const td = document.createElement("td");
        td.textContent = String(v);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);

    return wrapper;
  }

  destroy(): void {
    this.destroyed = true;
  }

  get estimatedHeight(): number {
    return 200;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
