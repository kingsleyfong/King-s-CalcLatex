import type KingsCalcLatexPlugin from "../main";
import type { KCLSettings } from "../types";

export class ExcalidrawShortcutManager {
	private keydownListener: ((e: KeyboardEvent) => void) | null = null;
	private activeCategory: "lineStyle" | "strokeWidth" | "edgeRoundness" | "sloppiness" | null = null;
	private hudEl: HTMLElement | null = null;
	private hudTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private plugin: KingsCalcLatexPlugin,
		private settings: KCLSettings
	) {}

	start(): void {
		this.keydownListener = (e: KeyboardEvent) => this.handleKeyDown(e);
		window.addEventListener("keydown", this.keydownListener, true);
	}

	destroy(): void {
		if (this.keydownListener) {
			window.removeEventListener("keydown", this.keydownListener, true);
			this.keydownListener = null;
		}
		this.hideHud();
	}

	private getExcalidrawAPI(view: any): any {
		try {
			if (view.excalidrawAPI) return view.excalidrawAPI;
			if (view.getExcalidrawAPI) return view.getExcalidrawAPI();
			if (view.plugin?.ea) return view.plugin.ea.getExcalidrawAPI();
			if ((window as any).ExcalidrawAutomate) {
				return (window as any).ExcalidrawAutomate.getExcalidrawAPI();
			}
		} catch {}
		return null;
	}

	private handleKeyDown(e: KeyboardEvent): void {
		if (!this.settings.enableExcalidrawOD || !this.settings.excalidrawElementShortcutsEnabled) return;

		// Ignore keypresses if user is typing in text fields or editor overlays
		const activeEl = document.activeElement;
		if (
			activeEl &&
			(activeEl instanceof HTMLInputElement ||
				activeEl instanceof HTMLTextAreaElement ||
				activeEl.isContentEditable ||
				activeEl.classList.contains("cm-content"))
		) {
			return;
		}

		// Check if active leaf is an Excalidraw view
		const activeLeaf = (this.plugin.app.workspace as any).activeLeaf || (this.plugin.app.workspace as any).getActiveLeaf();
		if (!activeLeaf || activeLeaf.view?.getViewType() !== "excalidraw") return;

		const view = activeLeaf.view as any;
		const api = this.getExcalidrawAPI(view);
		if (!api) return;

		const selectedElementIds = api.getAppState().selectedElementIds || {};
		const selectedIds = Object.keys(selectedElementIds).filter((id) => selectedElementIds[id]);

		// Intercept secondary keys (1, 2, 3, 4, or Escape) while HUD is active
		if (this.activeCategory) {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				this.hideHud();
				return;
			}

			if (selectedIds.length > 0 && ["1", "2", "3", "4"].includes(e.key)) {
				e.preventDefault();
				e.stopPropagation();
				const variantIdx = parseInt(e.key, 10);
				this.applyVariant(view, api, selectedIds, this.activeCategory, variantIdx);
				return;
			}
		}

		// Require selected elements for primary shortcut triggers
		if (selectedIds.length === 0) return;

		// Check modifier matching
		const modifier = this.settings.excalidrawElementShortcutModifier;
		let modifierMatches = false;

		if (modifier === "shift") {
			modifierMatches = e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
		} else if (modifier === "alt") {
			modifierMatches = e.altKey && !e.ctrlKey && !e.metaKey;
		} else if (modifier === "ctrl") {
			modifierMatches = (e.ctrlKey || e.metaKey) && !e.altKey;
		}

		if (!modifierMatches) return;

		const key = e.key.toLowerCase();
		let triggeredCategory: "lineStyle" | "strokeWidth" | "edgeRoundness" | "sloppiness" | null = null;

		if (key === (this.settings.excalidrawLineStyleKey || "f").toLowerCase()) {
			triggeredCategory = "lineStyle";
		} else if (key === (this.settings.excalidrawStrokeWidthKey || "d").toLowerCase()) {
			triggeredCategory = "strokeWidth";
		} else if (key === (this.settings.excalidrawEdgeRoundnessKey || "x").toLowerCase()) {
			triggeredCategory = "edgeRoundness";
		} else if (key === (this.settings.excalidrawSloppinessKey || "q").toLowerCase()) {
			triggeredCategory = "sloppiness";
		}

		if (!triggeredCategory) return;

		// Stop propagation so Excalidraw tools do not switch
		e.preventDefault();
		e.stopPropagation();

		// Cycle to the next property variant
		this.cycleVariant(view, api, selectedIds, triggeredCategory);
	}

	private cycleVariant(
		view: any,
		api: any,
		selectedIds: string[],
		category: "lineStyle" | "strokeWidth" | "edgeRoundness" | "sloppiness"
	): void {
		const elements = api.getSceneElements() as any[];
		const firstEl = elements.find((el) => selectedIds.includes(el.id) && !el.isDeleted);
		if (!firstEl) return;

		let nextVariantIdx = 1;

		if (category === "lineStyle") {
			const current = firstEl.strokeStyle || "solid";
			if (current === "solid") nextVariantIdx = 2; // dashed
			else if (current === "dashed") nextVariantIdx = 3; // dotted
			else nextVariantIdx = 1; // solid
		} else if (category === "strokeWidth") {
			const current = firstEl.strokeWidth || 1;
			if (current <= 1) nextVariantIdx = 2;
			else if (current === 2) nextVariantIdx = 3;
			else if (current === 4) nextVariantIdx = 4;
			else nextVariantIdx = 1;
		} else if (category === "edgeRoundness") {
			const isRound = Boolean(firstEl.roundness);
			nextVariantIdx = isRound ? 1 : 2;
		} else if (category === "sloppiness") {
			const current = firstEl.roughness ?? 0;
			if (current === 0) nextVariantIdx = 2;
			else if (current === 1) nextVariantIdx = 3;
			else nextVariantIdx = 1;
		}

		this.applyVariant(view, api, selectedIds, category, nextVariantIdx);
	}

	private applyVariant(
		view: any,
		api: any,
		selectedIds: string[],
		category: "lineStyle" | "strokeWidth" | "edgeRoundness" | "sloppiness",
		variantIdx: number
	): void {
		const elements = api.getSceneElements() as any[];
		const selectedSet = new Set(selectedIds);

		const updatedElements = elements.map((el) => {
			if (!selectedSet.has(el.id) || el.isDeleted) return el;

			const updated = { ...el, version: (el.version || 1) + 1, updated: Date.now() };

			if (category === "lineStyle") {
				if (variantIdx === 1) updated.strokeStyle = "solid";
				else if (variantIdx === 2) updated.strokeStyle = "dashed";
				else if (variantIdx === 3) updated.strokeStyle = "dotted";
			} else if (category === "strokeWidth") {
				if (variantIdx === 1) updated.strokeWidth = 1;
				else if (variantIdx === 2) updated.strokeWidth = 2;
				else if (variantIdx === 3) updated.strokeWidth = 4;
				else if (variantIdx === 4) updated.strokeWidth = 8;
			} else if (category === "edgeRoundness") {
				if (variantIdx === 1) updated.roundness = null;
				else if (variantIdx === 2) updated.roundness = { type: 3 };
			} else if (category === "sloppiness") {
				if (variantIdx === 1) updated.roughness = 0;
				else if (variantIdx === 2) updated.roughness = 1;
				else if (variantIdx === 3) updated.roughness = 2;
			}

			return updated;
		});

		api.updateScene({ elements: updatedElements });
		api.refresh();

		// Show HUD feedback
		this.showHud(view, category, variantIdx);
	}

	private showHud(
		view: any,
		category: "lineStyle" | "strokeWidth" | "edgeRoundness" | "sloppiness",
		activeVariantIdx: number
	): void {
		if (!this.settings.excalidrawShowShortcutHud) return;

		this.activeCategory = category;

		if (this.hudTimeout) {
			clearTimeout(this.hudTimeout);
			this.hudTimeout = null;
		}

		let container = view.contentEl as HTMLElement;
		if (!container) container = document.body;

		let hud = container.querySelector(".kcl-shortcut-hud") as HTMLElement;
		if (!hud) {
			hud = document.createElement("div");
			hud.className = "kcl-shortcut-hud";
			container.appendChild(hud);
		}

		let categoryLabel = "";
		let variants: { num: number; label: string }[] = [];

		if (category === "lineStyle") {
			categoryLabel = "Line Style";
			variants = [
				{ num: 1, label: "Solid" },
				{ num: 2, label: "Dashed" },
				{ num: 3, label: "Dotted" },
			];
		} else if (category === "strokeWidth") {
			categoryLabel = "Stroke Width";
			variants = [
				{ num: 1, label: "Thin (1px)" },
				{ num: 2, label: "Medium (2px)" },
				{ num: 3, label: "Thick (4px)" },
				{ num: 4, label: "X-Thick (8px)" },
			];
		} else if (category === "edgeRoundness") {
			categoryLabel = "Edges";
			variants = [
				{ num: 1, label: "Sharp" },
				{ num: 2, label: "Rounded" },
			];
		} else if (category === "sloppiness") {
			categoryLabel = "Sloppiness";
			variants = [
				{ num: 1, label: "Architect" },
				{ num: 2, label: "Artist" },
				{ num: 3, label: "Cartoonist" },
			];
		}

		hud.empty();

		const title = hud.createDiv({ cls: "kcl-hud-title" });
		title.setText(`Excalidraw OD · ${categoryLabel}`);

		const variantsRow = hud.createDiv({ cls: "kcl-hud-variants" });
		for (const v of variants) {
			const badge = variantsRow.createSpan({
				cls: `kcl-hud-badge${v.num === activeVariantIdx ? " is-active" : ""}`,
			});
			badge.createEl("kbd", { text: String(v.num) });
			badge.appendText(` ${v.label}`);
		}

		hud.classList.add("is-visible");
		this.hudEl = hud;

		// Keep HUD active for 2.2 seconds to allow secondary key selection
		this.hudTimeout = setTimeout(() => {
			this.hideHud();
		}, 2200);
	}

	private hideHud(): void {
		this.activeCategory = null;
		if (this.hudTimeout) {
			clearTimeout(this.hudTimeout);
			this.hudTimeout = null;
		}
		if (this.hudEl) {
			this.hudEl.classList.remove("is-visible");
			setTimeout(() => {
				if (this.hudEl && !this.hudEl.classList.contains("is-visible")) {
					this.hudEl.remove();
					this.hudEl = null;
				}
			}, 200);
		}
	}
}
