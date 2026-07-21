import type { SnippetDef, MathMode } from "./types";

export function parseSnippetDefs(
  snippetsStr: string,
  variablesStr: string,
): SnippetDef[] {
  const variables = parseVariables(variablesStr);
  const raw = evalSnippetString(snippetsStr);
  if (!Array.isArray(raw)) return [];

  return raw.map((entry: any) => {
    let trigger: string | RegExp = entry.trigger;
    let replacement: string | ((m: RegExpExecArray) => string) = entry.replacement;
    const options: string = entry.options || "";

    if (typeof trigger === "string") {
      for (const [varName, varPattern] of Object.entries(variables)) {
        trigger = (trigger as string).replaceAll(varName, varPattern);
      }
    }

    const isRegex = options.includes("r");
    if (isRegex && typeof trigger === "string") {
      try {
        trigger = new RegExp(trigger);
      } catch {
        /* Keep as string if regex fails */
      }
    }

    if (typeof replacement === "string") {
      for (const [varName, varPattern] of Object.entries(variables)) {
        replacement = (replacement as string).replaceAll(varName, varPattern);
      }
    }

    const flags = parseFlags(options);
    if (typeof replacement === "string" && replacement.includes("${VISUAL}")) {
      flags.visual = true;
    }

    return {
      trigger,
      replacement,
      options,
      priority: entry.priority ?? 0,
      description: entry.description,
      flags,
    };
  });
}

function parseFlags(options: string) {
  return {
    math: options.includes("m"),
    text: options.includes("t"),
    display: options.includes("M"),
    auto: options.includes("A"),
    regex: options.includes("r"),
    word: options.includes("w"),
    visual: options.includes("v"),
  };
}

function parseVariables(variablesStr: string): Record<string, string> {
  if (!variablesStr) return {};
  try {
    return JSON.parse(variablesStr);
  } catch {
    try {
      return new Function(`return (${variablesStr})`)() as Record<string, string>;
    } catch {
      return {};
    }
  }
}

function evalSnippetString(str: string): any[] {
  if (!str) return [];
  try {
    return new Function(`return (${str})`)() as any[];
  } catch {
    try {
      const stripped = str
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim();
      return new Function(`return (${stripped})`)() as any[];
    } catch {
      console.error("[KCL Excalidraw] Failed to parse snippet definitions");
      return [];
    }
  }
}

export function detectMathMode(text: string, cursorPos: number): MathMode {
  let i = 0;
  let inMath = false;
  let isDisplay = false;

  while (i < cursorPos && i < text.length) {
    if (text[i] === "$" && (i === 0 || text[i - 1] !== "\\")) {
      if (text[i + 1] === "$" && !inMath) {
        inMath = true;
        isDisplay = true;
        i += 2;
        continue;
      } else if (isDisplay && inMath && text[i + 1] === "$") {
        inMath = false;
        isDisplay = false;
        i += 2;
        continue;
      } else if (!isDisplay) {
        inMath = !inMath;
        isDisplay = false;
        i++;
        continue;
      }
    }
    i++;
  }

  if (!inMath) return "text";
  return isDisplay ? "display" : "math";
}

export function isWordDelimiter(ch: string, delimiters: string): boolean {
  return delimiters.includes(ch) || ch === "" || /\s/.test(ch);
}

export function resolveVisualPlaceholder(replacement: string, selectedText: string): string {
  return replacement.replace(/\$\{VISUAL(?::([^}]+))?\}/g, (_match, defaultValue) => {
    if (selectedText) {
      return selectedText;
    }
    return defaultValue || "";
  });
}
