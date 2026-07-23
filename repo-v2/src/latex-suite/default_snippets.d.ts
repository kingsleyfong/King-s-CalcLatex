// Type shim for the vendored default_snippets.js snippet-definition array.
// The runtime value is authored in JS (mixed string/regex/function replacements);
// it is consumed via parseRawSnippetArray, which validates each entry at runtime.
declare const DEFAULT_SNIPPETS: any[];
export default DEFAULT_SNIPPETS;
