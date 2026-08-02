/**
 * Kings CalcLaTeX v2 — Excalidraw Drawing Snapshot/Restore
 *
 * Excalidraw's own file format regenerates equation images from stored LaTeX source on
 * every load, rescaling them to match the element's current on-canvas size. That rescale
 * step has proven fragile in practice (equations silently reverting to their natural,
 * unscaled size after an Obsidian reload) -- see repo-v2/CLAUDE.md Design Principles #1
 * for the related hitbox-consistency issue with the same root cause (third-party
 * MathJax-to-SVG sizing math we don't control).
 *
 * This module snapshots every element's position/size in the CURRENT live scene (via
 * ExcalidrawAutomate's public getSceneElements()/updateScene() API -- not by parsing
 * Excalidraw's internal compressed-file format, which is an implementation detail that
 * could change between Excalidraw versions without notice) and can restore from a
 * snapshot later, so a bad reload never costs more than "restore the snapshot."
 */

import { App, FuzzySuggestModal, Notice, TFile, TFolder } from "obsidian";
import type KingsCalcLatexPlugin from "../main";

interface ElementSnapshot {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  scale?: [number, number];
}

const SNAPSHOT_INFIX = ".snapshot.";

/** Filename-safe (no colons) and lexically sortable, e.g. "2026-07-31_20-45-03". */
function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

class SnapshotPickerModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private snapshots: TFile[],
    private onChoose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder("Choose a snapshot to restore from…");
  }

  getItems(): TFile[] {
    return this.snapshots;
  }

  getItemText(file: TFile): string {
    return file.name;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

export class ExcalidrawSnapshotManager {
  constructor(
    private app: App,
    private plugin: KingsCalcLatexPlugin,
  ) {}

  private getActiveExcalidrawView(): any {
    const activeLeaf = (this.app.workspace as any).activeLeaf ?? (this.app.workspace as any).getActiveLeaf?.();
    if (!activeLeaf || activeLeaf.view?.getViewType?.() !== "excalidraw") return null;
    return activeLeaf.view;
  }

  // Called as a method (not destructured) -- ExcalidrawAutomate reads `this` internally.
  private getExcalidrawAPI(view: any): any {
    try {
      if (view.ea?.getExcalidrawAPI) return view.ea.getExcalidrawAPI();
      const ea = (window as any).ExcalidrawAutomate;
      if (typeof ea?.getExcalidrawAPI === "function") return ea.getExcalidrawAPI();
    } catch {
      // no ExcalidrawAutomate API available on this view -- fall through to null
    }
    return null;
  }

  async snapshotCurrentDrawing(): Promise<void> {
    const view = this.getActiveExcalidrawView();
    if (!view) {
      new Notice("KCL: No active Excalidraw drawing to snapshot.");
      return;
    }
    const file: TFile | undefined = view.file;
    if (!file) {
      new Notice("KCL: Could not determine the current drawing's file.");
      return;
    }
    const api = this.getExcalidrawAPI(view);
    if (!api) {
      new Notice("KCL: Excalidraw API not available.");
      return;
    }

    const elements = api.getSceneElements() as any[];
    const snapshot: Record<string, ElementSnapshot> = {};
    let count = 0;
    for (const el of elements) {
      if (el.isDeleted) continue;
      snapshot[el.id] = {
        type: el.type,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        angle: el.angle,
        scale: el.scale,
      };
      count++;
    }

    const folderPath = file.parent?.path ?? "";
    const timestamp = formatTimestamp(new Date());
    const snapshotName = `${file.basename}${SNAPSHOT_INFIX}${timestamp}.json`;
    const snapshotPath = folderPath ? `${folderPath}/${snapshotName}` : snapshotName;

    await this.app.vault.create(snapshotPath, JSON.stringify(snapshot, null, 2));
    new Notice(`KCL: Snapshotted ${count} elements → ${snapshotName}`);
  }

  async restoreFromSnapshot(): Promise<void> {
    const view = this.getActiveExcalidrawView();
    if (!view) {
      new Notice("KCL: No active Excalidraw drawing to restore into.");
      return;
    }
    const file: TFile | undefined = view.file;
    if (!file) {
      new Notice("KCL: Could not determine the current drawing's file.");
      return;
    }
    const api = this.getExcalidrawAPI(view);
    if (!api) {
      new Notice("KCL: Excalidraw API not available.");
      return;
    }

    const folder = file.parent;
    if (!(folder instanceof TFolder)) {
      new Notice("KCL: Could not determine the drawing's folder.");
      return;
    }

    const prefix = `${file.basename}${SNAPSHOT_INFIX}`;
    const candidates = folder.children
      .filter((f): f is TFile => f instanceof TFile && f.name.startsWith(prefix) && f.extension === "json")
      .sort((a, b) => b.name.localeCompare(a.name)); // timestamp in filename sorts lexically -- newest first

    if (candidates.length === 0) {
      new Notice(`KCL: No snapshots found for "${file.basename}".`);
      return;
    }

    new SnapshotPickerModal(this.app, candidates, async (chosen) => {
      await this.applySnapshot(api, chosen);
    }).open();
  }

  private async applySnapshot(api: any, snapshotFile: TFile): Promise<void> {
    const raw = await this.app.vault.read(snapshotFile);
    let snapshot: Record<string, ElementSnapshot>;
    try {
      snapshot = JSON.parse(raw);
    } catch {
      new Notice(`KCL: "${snapshotFile.name}" is not valid snapshot JSON.`);
      return;
    }

    const elements = api.getSceneElements() as any[];
    let restoredCount = 0;
    const updated = elements.map((el) => {
      if (el.isDeleted) return el;
      const good = snapshot[el.id];
      if (!good) return el;
      const changed =
        el.x !== good.x || el.y !== good.y || el.width !== good.width || el.height !== good.height;
      if (!changed) return el;
      restoredCount++;
      return {
        ...el,
        x: good.x,
        y: good.y,
        width: good.width,
        height: good.height,
        angle: good.angle ?? el.angle,
        scale: good.scale ?? el.scale,
        version: (el.version || 1) + 1,
        updated: Date.now(),
      };
    });

    if (restoredCount === 0) {
      new Notice(`KCL: Nothing to restore -- scene already matches "${snapshotFile.name}".`);
      return;
    }

    api.updateScene({ elements: updated });
    new Notice(`KCL: Restored ${restoredCount} element(s) from "${snapshotFile.name}".`);
  }
}
