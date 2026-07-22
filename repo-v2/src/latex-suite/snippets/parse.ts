import { Snippet, SnippetType } from "./snippets";
import { SnippetTabstopOnlyNode } from "./luasnip_api/node";

export const DEFAULT_SNIPPET_VARIABLES: Record<string, string> = {
  "${GREEK}": "(?:alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|vartheta|Theta|iota|kappa|lambda|Lambda|mu|nu|xi|omicron|pi|rho|varrho|sigma|Sigma|tau|upsilon|Upsilon|phi|varphi|Phi|chi|psi|omega|Omega)",
  "${SYMBOL}": "(?:parallel|perp|partial|nabla|hbar|ell|infty|oplus|ominus|otimes|oslash|square|star|dagger|vee|wedge|subseteq|subset|subseteq|supset|emptyset|exists|nexists|forall|implies|impliedby|iff|setminus|neg|lor|land|bigcup|bigcap|cdot|times|simeq|approx)",
  "${MORE_SYMBOLS}": "(?:leq|geq|neq|gg|ll|equiv|sim|propto|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|to|mapsto|cap|cup|in|sum|prod|exp|ln|log|det|dots|vdots|ddots|pm|mp|int|iint|iiint|oint)",
};

export function parseRawSnippetsFromStr(snippetsStr: string): Snippet<SnippetType>[] {
  try {
    const raw = new Function("return " + snippetsStr)();
    return parseRawSnippets(raw);
  } catch (e) {
    console.error("Failed to parse raw snippets string:", e);
    return [];
  }
}

export function parseRawSnippets(raw: any[]): Snippet<SnippetType>[] {
  const result: Snippet<SnippetType>[] = [];

  for (const item of raw) {
    if (!item.trigger || item.replacement === undefined) continue;

    let trigger = item.trigger;
    const opts = item.options || "";
    const rawReplacement = typeof item.replacement === "string" ? item.replacement : "";

    // Substitute variables if trigger is a string
    if (typeof trigger === "string") {
      for (const [varName, varVal] of Object.entries(DEFAULT_SNIPPET_VARIABLES)) {
        if (trigger.includes(varName)) {
          trigger = trigger.replace(new RegExp(escapeRegExp(varName), "g"), varVal);
        }
      }
    }

    const isRegex = opts.includes("r") || trigger instanceof RegExp;
    const replacementNode = typeof item.replacement === "string"
      ? new SnippetTabstopOnlyNode(item.replacement)
      : item.replacement;

    if (isRegex) {
      let reg: RegExp;
      if (trigger instanceof RegExp) {
        reg = trigger;
      } else {
        // Substitute variables in regex pattern string
        let pattern = trigger;
        for (const [varName, varVal] of Object.entries(DEFAULT_SNIPPET_VARIABLES)) {
          if (pattern.includes(varName)) {
            pattern = pattern.replace(new RegExp(escapeRegExp(varName), "g"), varVal);
          }
        }
        reg = new RegExp(pattern + "$");
      }

      result.push(
        new Snippet(
          "regex",
          { trigger: reg, replacement: replacementNode },
          opts,
          item.description || "",
          item.priority || 0,
          rawReplacement,
        ),
      );
    } else {
      result.push(
        new Snippet(
          "string",
          { trigger: trigger, replacement: replacementNode },
          opts,
          item.description || "",
          item.priority || 0,
          rawReplacement,
        ),
      );
    }
  }

  return result;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
