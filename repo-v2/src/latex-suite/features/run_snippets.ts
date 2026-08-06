import { EditorView } from "@codemirror/view";
import { EditorState, SelectionRange } from "@codemirror/state";
import { getLatexSuiteConfig } from "src/snippets/codemirror/config";
import { queueSnippet } from "src/snippets/codemirror/snippet_queue_state_field";
import { expandSnippets } from "src/snippets/snippet_management";
import { Context, getContextPlugin } from "src/utils/context";
import { autoEnlargeBrackets } from "./auto_enlarge_brackets";
import { snippetDebugLevel } from "src/settings/settings";
import { Snippet, SnippetType } from "src/snippets/snippets";
import { showSnippetInfo } from "src/editor_extensions/obsidian_utils";

type SnippetInfo = {
	snippets: Snippet<SnippetType>[];
	key?: string;
}
type RunSnippetsOptions = {
	recursive: number;
	debug: snippetDebugLevel;
}
export const runSnippets = (view: EditorView, snippetInfo: SnippetInfo, options: RunSnippetsOptions):boolean => {
	let didExpand = false;
	for (let i=0; i <= options.recursive; i++) {
		const ctx = getContextPlugin(view);
		let shouldAutoEnlargeBrackets = false;

		for (const range of ctx.ranges) {
			const result = runSnippetCursor(view, ctx, snippetInfo, range, options.debug);

			if (result.shouldAutoEnlargeBrackets) shouldAutoEnlargeBrackets = true;
		}

		const success = expandSnippets(view);
		didExpand = didExpand || success;


		if (shouldAutoEnlargeBrackets) {
			autoEnlargeBrackets(view);
		}
		if (!success) {
			break
		}
		snippetInfo.key = undefined; // only run keypress once.
	}
	return didExpand
}
// KCL fork addition -- upstream slices sliceDoc(0, to) unconditionally, which is O(cursor
// position) on EVERY keystroke: for a large document with the cursor far from the start,
// this re-materializes a huge string every single keystroke (confirmed via upstream issue
// artisticat1/obsidian-latex-suite#320, still open -- "LaTeX Suite will significantly
// affect Obsidian's performance" on documents over ~10-25k characters). All trigger
// matching (string .endsWith(), regex $-anchored .exec()) only ever needs to look at text
// near the cursor -- built-in and realistic custom snippet triggers are at most a few dozen
// characters -- so bounding the slice to a large-but-fixed window turns this into O(1)
// relative to document size instead of O(document length before cursor), with the same
// generous margin on the forward slice (used for ^-anchored `triggerAfter` matching).
const SNIPPET_CONTEXT_WINDOW = 2000;

const getSliceAroundCursor = (view: EditorView, to: number) => {
	const windowStart = Math.max(0, to - SNIPPET_CONTEXT_WINDOW);
	const line = view.state.sliceDoc(windowStart, to);
	let cachedLineAfter: string | null = null;
	const effectiveLineAfter = () => {
		cachedLineAfter = cachedLineAfter ?? view.state.sliceDoc(to, Math.min(view.state.doc.length, to + SNIPPET_CONTEXT_WINDOW));
		return cachedLineAfter;
	};
	return {line, effectiveLineAfter, windowStart};
}

const runSnippetCursor = (view: EditorView, ctx: Context, snippetInfo: SnippetInfo, range: SelectionRange, debug: snippetDebugLevel):{success: boolean; shouldAutoEnlargeBrackets: boolean} => {

	const settings = getLatexSuiteConfig(view);
	const {from, to} = range;
	const sel = view.state.sliceDoc(from, to);
	const {line, effectiveLineAfter, windowStart} = getSliceAroundCursor(view, to);
	const key = snippetInfo.key ?? "";
	// If the key pressed wasn't a text character, continue
	if (snippetInfo.key && snippetInfo.key.length !== 1) {
		return {success: false, shouldAutoEnlargeBrackets: false};
	}
	const updatedLine = line + key;
	for (let i=0; i < snippetInfo.snippets.length; i++) {
		const snippet = snippetInfo.snippets[i];

		if (!snippet.options.snippetShouldRunInMode(ctx.mode)) {
			continue;
		}

		const result = snippet.process(updatedLine, range, sel, effectiveLineAfter);
		if (result === null) continue;

		// Check that this snippet is not excluded in a certain environment
		let isExcluded = false;
		// in practice, a snippet should have very few excluded environments, if any,
		// so the cost of this check shouldn't be very high
		for (const environment of snippet.excludedEnvironments) {
			if (ctx.isWithinEnvironment(to, environment)) { isExcluded = true; }
		}
		// we could've used a labelled outer for loop to `continue` from within the inner for loop,
		// but labels are extremely rarely used, so we do this construction instead
		if (isExcluded) { continue; }

		// result.triggerPos/triggerEndPos come back as positions WITHIN `updatedLine` (i.e.
		// relative to `windowStart`) for string/regex snippets -- except VisualSnippet, whose
		// triggerPos is `range.from` (already an absolute document position, computed
		// independently of the slice). Only the former need windowStart added back; adding it
		// to an already-absolute VisualSnippet position would double-count the offset.
		const triggerPos = snippet.type === "visual" ? result.triggerPos : result.triggerPos + windowStart;
		const triggerEndPos = result.triggerEndPos
			? result.triggerEndPos + windowStart - key.length
			: to;

		if (snippet.options.onWordBoundary) {
			// Check that the trigger is preceded and followed by a word delimiter
			if (!isOnWordBoundary(view.state, triggerPos, to, settings.wordDelimiters)) continue;
		}

		let replacement = result.replacement;

		// When in inline math, remove any spaces at the end of the replacement
		if (ctx.mode.inlineMath && settings.removeSnippetWhitespace) {
			replacement.insert = trimWhitespace(replacement.insert, ctx);
		}

		// Expand the snippet
		const start = triggerPos;
		const triggerKey =
			snippet.options.automatic && snippet.type !== "visual" && snippet.options.undoKey
				? key
				: undefined;
		queueSnippet(view, start, triggerEndPos, replacement, triggerKey, to);

		const containsTrigger = settings.autoEnlargeBracketsTriggers.some(word => replacement.insert.contains(word));
		if (debug === "info" || debug === "verbose") {
			showSnippetInfo(view.state, snippet, replacement.insert, containsTrigger);
		}
		if (debug === "verbose") {
			console.debug({
				snippets_unexpanded: snippetInfo.snippets
					.slice(0, i)
					.map((s) => ({
						description: s.description,
						trigger: s.trigger,
						options: s.options,
						replacement: s.replacement
					})),
				current_mode: ctx.mode,
				updatedLine,
			});	
		}	
		return {success: true, shouldAutoEnlargeBrackets: containsTrigger};
	}


	return {success: false, shouldAutoEnlargeBrackets: false};
}

const isOnWordBoundary = (state: EditorState, triggerPos: number, to: number, wordDelimiters: string) => {
	const prevChar = state.sliceDoc(triggerPos-1, triggerPos);
	const nextChar = state.sliceDoc(to, to+1);

	wordDelimiters = wordDelimiters.replace("\\n", "\n");

	return (wordDelimiters.contains(prevChar) && wordDelimiters.contains(nextChar));
}

const trimWhitespace = (replacement: string, _ctx: Context) => {
	let spaceIndex = 0;

	if (replacement.endsWith(" ")) {
		spaceIndex = -1;
	}
	else {
		const lastThreeChars = replacement.slice(-3);
		const lastChar = lastThreeChars.slice(-1);

		if (lastThreeChars.slice(0, 2) === " $" && !isNaN(parseInt(lastChar))) {
			spaceIndex = -3;
		}
	}

	if (spaceIndex != 0) {
		if (spaceIndex === -1) {
			replacement = replacement.trimEnd();
		}
		else if (spaceIndex === -3){
			replacement = replacement.slice(0, -3) + replacement.slice(-2);
		}
	}

	return replacement;
}
