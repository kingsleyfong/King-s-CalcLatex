import { WorkspaceLeaf } from "obsidian";

/**
 * Intercepts ephemeral text-editing textareas in Excalidraw canvases.
 */
export class TextareaInterceptor {
  private focusInListeners = new Map<WorkspaceLeaf, (e: FocusEvent) => void>();
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
    const handleFocusIn = this.focusInListeners.get(leaf);
    if (handleFocusIn) {
      const view = leaf.view as any;
      const container = this.getExcalidrawContainer(view);
      if (container) {
        container.removeEventListener("focusin", handleFocusIn, true);
      }
      this.focusInListeners.delete(leaf);
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
    if (this.activeTextarea) {
      this.handleDetach();
    }
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

  for (const delay of [0, 10, 30]) {
    setTimeout(() => {
      if (textarea && typeof textarea.setSelectionRange === "function") {
        textarea.setSelectionRange(selectionStart, selectionEnd);
        textarea.focus();
      }
    }, delay);
  }
}
