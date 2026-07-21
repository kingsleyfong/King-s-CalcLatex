export interface RawSnippet {
  trigger: string;
  replacement: string;
  options?: string; // "m" = math mode only, "t" = text mode only, "A" = auto-expand, "r" = regex
  description?: string;
}

export const DEFAULT_LATEX_SUITE_SNIPPETS: RawSnippet[] = [
  // Mode toggles
  { trigger: "mk", replacement: "$$0$", options: "tA", description: "Inline math environment" },
  { trigger: "dm", replacement: "$$\n$0\n$$", options: "tA", description: "Display math environment" },

  // Fractions & Roots
  { trigger: "fra", replacement: "\\frac{$1}{$2}$0", options: "mA", description: "Fraction" },
  { trigger: "//", replacement: "\\frac{$1}{$2}$0", options: "mA", description: "Fraction shortcut" },
  { trigger: "sq", replacement: "\\sqrt{$1}$0", options: "mA", description: "Square root" },

  // Subscripts & Superscripts
  { trigger: "sr", replacement: "^2", options: "mA", description: "Squared" },
  { trigger: "cb", replacement: "^3", options: "mA", description: "Cubed" },
  { trigger: "rd", replacement: "^{$1}$0", options: "mA", description: "Superscript" },
  { trigger: "_", replacement: "_{$1}$0", options: "mA", description: "Subscript" },

  // Common Math Operators & Symbols
  { trigger: "ee", replacement: "e^{$1}$0", options: "mA", description: "Exponential" },
  { trigger: "oo", replacement: "\\infty", options: "mA", description: "Infinity" },
  { trigger: "sum", replacement: "\\sum_{${1:i=1}}^{${2:n}} $0", options: "mA", description: "Summation" },
  { trigger: "int", replacement: "\\int_{${1:a}}^{${2:b}} $0", options: "mA", description: "Definite Integral" },
  { trigger: "lim", replacement: "\\lim_{${1:n \\to \\infty}} $0", options: "mA", description: "Limit" },

  // Greek Letters
  { trigger: "al", replacement: "\\alpha", options: "mA", description: "Alpha" },
  { trigger: "be", replacement: "\\beta", options: "mA", description: "Beta" },
  { trigger: "ga", replacement: "\\gamma", options: "mA", description: "Gamma" },
  { trigger: "de", replacement: "\\delta", options: "mA", description: "Delta" },
  { trigger: "ep", replacement: "\\epsilon", options: "mA", description: "Epsilon" },
  { trigger: "ze", replacement: "\\zeta", options: "mA", description: "Zeta" },
  { trigger: "et", replacement: "\\eta", options: "mA", description: "Eta" },
  { trigger: "th", replacement: "\\theta", options: "mA", description: "Theta" },
  { trigger: "io", replacement: "\\iota", options: "mA", description: "Iota" },
  { trigger: "ka", replacement: "\\kappa", options: "mA", description: "Kappa" },
  { trigger: "la", replacement: "\\lambda", options: "mA", description: "Lambda" },
  { trigger: "mu", replacement: "\\mu", options: "mA", description: "Mu" },
  { trigger: "nu", replacement: "\\nu", options: "mA", description: "Nu" },
  { trigger: "xi", replacement: "\\xi", options: "mA", description: "Xi" },
  { trigger: "pi", replacement: "\\pi", options: "mA", description: "Pi" },
  { trigger: "ro", replacement: "\\rho", options: "mA", description: "Rho" },
  { trigger: "si", replacement: "\\sigma", options: "mA", description: "Sigma" },
  { trigger: "ta", replacement: "\\tau", options: "mA", description: "Tau" },
  { trigger: "ph", replacement: "\\phi", options: "mA", description: "Phi" },
  { trigger: "chi", replacement: "\\chi", options: "mA", description: "Chi" },
  { trigger: "ps", replacement: "\\psi", options: "mA", description: "Psi" },
  { trigger: "om", replacement: "\\omega", options: "mA", description: "Omega" },

  // Matrices
  { trigger: "pmat", replacement: "\\begin{pmatrix}\n$0\n\\end{pmatrix}", options: "mA", description: "Parenthesis Matrix" },
  { trigger: "bmat", replacement: "\\begin{bmatrix}\n$0\n\\end{bmatrix}", options: "mA", description: "Bracket Matrix" },
  { trigger: "vmat", replacement: "\\begin{vmatrix}\n$0\n\\end{vmatrix}", options: "mA", description: "Determinant Matrix" },
];
