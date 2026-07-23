import { WorkspaceLeaf } from "obsidian";

/**
 * Intercepts ephemeral text-editing textareas in Excalidraw canvases.
 */
export class TextareaInterceptor {
  private focusInListeners = new Map<WorkspaceLeaf, (e: FocusEvent) => void>();
  private blurSyncListeners = new Map<WorkspaceLeaf, (e: FocusEvent) => void>();
  private activeTextarea: HTMLTextAreaElement | null = null;

  constructor(
    private onAttach: (textarea: HTMLTextAreaElement, view: any) => void,
    private onDetach: () => void,
  ) {}

  watchLeaf(leaf: WorkspaceLeaf): void {
    if (this.focusInListeners.has(leaf)) return;

    const view = leaf.view as any;
    const container = this.getExcalidrawContainer(view);
    if (!container) return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (target instanceof HTMLTextAreaElement) {
        if (
          !target.closest(".modal-container") &&
          !target.closest(".excalidraw-prompt") &&
          !target.closest(".excalidraw-dialog")
        ) {
          this.handleAttach(target, view);
        }
      }
    };

    container.addEventListener("focusin", handleFocusIn, true);
    this.focusInListeners.set(leaf, handleFocusIn);

    // `blur` does not bubble, but it does have a capture phase. Registering here
    // (an ancestor of the textarea) guarantees this fires *before* Excalidraw's own
    // blur listener on the textarea itself, regardless of listener registration order --
    // giving us a chance to normalize the text (trim trailing whitespace left behind by
    // snippet expansion, e.g. after "dm" expands to "$$\n\t$0\n$$") before Excalidraw's
    // native tex2svg equation conversion reads it on blur.
    const handleBlurSync = (e: FocusEvent) => {
      const target = e.target;
      if (target instanceof HTMLTextAreaElement && target === this.activeTextarea) {
        this.syncEditingElementText(target, view);
      }
    };
    container.addEventListener("blur", handleBlurSync, true);
    this.blurSyncListeners.set(leaf, handleBlurSync);

    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLTextAreaElement && container.contains(activeEl)) {
      if (
        !activeEl.closest(".modal-container") &&
        !activeEl.closest(".excalidraw-prompt") &&
        !activeEl.closest(".excalidraw-dialog")
      ) {
        this.handleAttach(activeEl, view);
      }
    }
  }

  unwatchLeaf(leaf: WorkspaceLeaf): void {
    const view = leaf.view as any;
    const container = this.getExcalidrawContainer(view);

    const handleFocusIn = this.focusInListeners.get(leaf);
    if (handleFocusIn) {
      if (container) container.removeEventListener("focusin", handleFocusIn, true);
      this.focusInListeners.delete(leaf);
    }

    const handleBlurSync = this.blurSyncListeners.get(leaf);
    if (handleBlurSync) {
      if (container) container.removeEventListener("blur", handleBlurSync, true);
      this.blurSyncListeners.delete(leaf);
    }
  }

  destroy(): void {
    for (const [leaf, handleFocusIn] of this.focusInListeners) {
      const view = leaf.view as any;
      const container = this.getExcalidrawContainer(view);
      if (container) {
        container.removeEventListener("focusin", handleFocusIn, true);
      }
    }
    this.focusInListeners.clear();

    for (const [leaf, handleBlurSync] of this.blurSyncListeners) {
      const view = leaf.view as any;
      const container = this.getExcalidrawContainer(view);
      if (container) {
        container.removeEventListener("blur", handleBlurSync, true);
      }
    }
    this.blurSyncListeners.clear();

    if (this.activeTextarea) {
      this.handleDetach();
    }
  }

  /**
   * Normalizes the currently-edited Excalidraw text element's text just before
   * Excalidraw's own blur handler runs, so its native math-to-SVG conversion sees
   * a cleanly-terminated equation (e.g. no trailing newline/whitespace after a
   * closing "$$" left behind by snippet expansion).
   */
  private syncEditingElementText(textarea: HTMLTextAreaElement, view: any): void {
    const value = textarea.value;
    const trimmed = value.trim();
    if (trimmed === value) return;

    try {
      const api = this.getExcalidrawAPI(view);
      const el = api?.getAppState?.()?.editingTextElement;
      if (!el) return;

      el.text = trimmed;
      el.originalText = trimmed;
      el.rawText = trimmed;
    } catch {
      /* Best-effort sync -- if Excalidraw's internal shape changed, don't throw during blur. */
    }
  }

  private getExcalidrawAPI(view: any): any {
    try {
      if (view.excalidrawAPI) return view.excalidrawAPI;
      if (view.ea?.getExcalidrawAPI) return view.ea.getExcalidrawAPI();
      const ea = (window as any).ExcalidrawAutomate;
      if (ea?.getExcalidrawAPI) return ea.getExcalidrawAPI();
    } catch {
      /* Graceful fallback */
    }
    return null;
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
    } catch {
      /* Graceful fallback */
    }
    return null;
  }

  private handleAttach(textarea: HTMLTextAreaElement, view: any): void {
    if (this.activeTextarea === textarea) return;

    this.activeTextarea = textarea;
    this.onAttach(textarea, view);

    const handleBlur = () => {
      setTimeout(() => {
        if (this.activeTextarea === textarea) {
          this.handleDetach();
        }
      }, 0);
    };

    textarea.addEventListener("blur", handleBlur, { once: true });
  }

  private handleDetach(): void {
    this.activeTextarea = null;
    this.onDetach();
  }
}

export function setTextareaValue(
  textarea: HTMLTextAreaElement | HTMLInputElement,
  value: string,
): void {
  const prototype =
    textarea instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;

  const nativeSet = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (nativeSet) {
    nativeSet.call(textarea, value);
  } else {
    textarea.value = value;
  }

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

export function updateTextarea(
  textarea: HTMLTextAreaElement | HTMLInputElement,
  value: string,
  selectionStart: number,
  selectionEnd: number,
): void {
  const prototype =
    textarea instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;

  const nativeSet = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (nativeSet) {
    nativeSet.call(textarea, value);
  } else {
    textarea.value = value;
  }

  if (textarea && typeof textarea.setSelectionRange === "function") {
    textarea.setSelectionRange(selectionStart, selectionEnd);
  }

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));

  for (const delay of [0, 10, 30]) {
    setTimeout(() => {
      if (textarea && typeof textarea.setSelectionRange === "function") {
        textarea.setSelectionRange(selectionStart, selectionEnd);
        textarea.focus();
      }
    }, delay);
  }
}
