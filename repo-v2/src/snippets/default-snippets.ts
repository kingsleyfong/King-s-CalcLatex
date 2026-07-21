export interface RawSnippet {
  trigger: string;
  replacement: string;
  options?: string; // "m" = math mode only, "t" = text mode only, "A" = auto-expand, "r" = regex
  description?: string;
}

export const DEFAULT_LATEX_SUITE_SNIPPETS: RawSnippet[] = [
  // ── Mode Toggles ──
  { trigger: "mk", replacement: "$$0$", options: "tA", description: "Inline math environment" },
  { trigger: "dm", replacement: "$$\n$0\n$$", options: "tA", description: "Display math environment" },

  // ── Environment Shortcuts ──
  { trigger: "beg", replacement: "\\begin{$1}\n$0\n\\end{$1}", options: "mA", description: "Begin environment" },
  { trigger: "case", replacement: "\\begin{cases}\n$0\n\\end{cases}", options: "mA", description: "Cases environment" },
  { trigger: "align", replacement: "\\begin{align}\n$0\n\\end{align}", options: "mA", description: "Align environment" },
  { trigger: "matrix", replacement: "\\begin{matrix}\n$0\n\\end{matrix}", options: "mA", description: "Matrix environment" },
  { trigger: "pmat", replacement: "\\begin{pmatrix}\n$0\n\\end{pmatrix}", options: "mA", description: "Parenthesis Matrix" },
  { trigger: "bmat", replacement: "\\begin{bmatrix}\n$0\n\\end{bmatrix}", options: "mA", description: "Bracket Matrix" },
  { trigger: "vmat", replacement: "\\begin{vmatrix}\n$0\n\\end{vmatrix}", options: "mA", description: "Determinant Matrix" },

  // ── Fractions & Roots ──
  { trigger: "fra", replacement: "\\frac{$1}{$2}$0", options: "mA", description: "Fraction" },
  { trigger: "//", replacement: "\\frac{$1}{$2}$0", options: "mA", description: "Fraction shortcut" },
  { trigger: "sq", replacement: "\\sqrt{$1}$0", options: "mA", description: "Square root" },

  // ── Subscripts & Superscripts ──
  { trigger: "sr", replacement: "^2", options: "mA", description: "Squared" },
  { trigger: "cb", replacement: "^3", options: "mA", description: "Cubed" },
  { trigger: "rd", replacement: "^{$1}$0", options: "mA", description: "Superscript" },
  { trigger: "_", replacement: "_{$1}$0", options: "mA", description: "Subscript" },

  // ── Math Accents ──
  { trigger: "hat", replacement: "\\hat{$1}$0", options: "mA", description: "Hat accent" },
  { trigger: "bar", replacement: "\\bar{$1}$0", options: "mA", description: "Bar accent" },
  { trigger: "vec", replacement: "\\vec{$1}$0", options: "mA", description: "Vector accent" },
  { trigger: "tilde", replacement: "\\tilde{$1}$0", options: "mA", description: "Tilde accent" },
  { trigger: "dot", replacement: "\\dot{$1}$0", options: "mA", description: "Dot derivative" },
  { trigger: "ddot", replacement: "\\ddot{$1}$0", options: "mA", description: "Double dot derivative" },
  { trigger: "ora", replacement: "\\overrightarrow{$1}$0", options: "mA", description: "Over right arrow" },

  // ── Operators & Logic Symbols ──
  { trigger: "->", replacement: "\\to ", options: "mA", description: "Right arrow" },
  { trigger: "=>", replacement: "\\implies ", options: "mA", description: "Implies" },
  { trigger: "=<", replacement: "\\impliedby ", options: "mA", description: "Implied by" },
  { trigger: "=:", replacement: "\\equiv ", options: "mA", description: "Equivalent" },
  { trigger: "!=", replacement: "\\neq ", options: "mA", description: "Not equal" },
  { trigger: "<=", replacement: "\\le ", options: "mA", description: "Less than or equal" },
  { trigger: ">=", replacement: "\\ge ", options: "mA", description: "Greater than or equal" },
  { trigger: "xx", replacement: "\\times ", options: "mA", description: "Times" },
  { trigger: "**", replacement: "\\cdot ", options: "mA", description: "Dot product" },
  { trigger: "||", replacement: "\\mid ", options: "mA", description: "Mid bar" },
  { trigger: "cc", replacement: "\\subset ", options: "mA", description: "Subset" },
  { trigger: "c=", replacement: "\\subseteq ", options: "mA", description: "Subset eq" },
  { trigger: "nn", replacement: "\\cap ", options: "mA", description: "Intersection" },
  { trigger: "uu", replacement: "\\cup ", options: "mA", description: "Union" },
  { trigger: "in", replacement: "\\in ", options: "mA", description: "Element of" },
  { trigger: "notin", replacement: "\\notin ", options: "mA", description: "Not element of" },

  // ── Brackets & Wrappers ──
  { trigger: "avg", replacement: "\\langle $1 \\rangle$0", options: "mA", description: "Angle brackets" },
  { trigger: "norm", replacement: "\\| $1 \\|$0", options: "mA", description: "Norm" },
  { trigger: "abs", replacement: "| $1 |$0", options: "mA", description: "Absolute value" },
  { trigger: "ceil", replacement: "\\ceil $1 \\rceil$0", options: "mA", description: "Ceiling" },
  { trigger: "floor", replacement: "\\floor $1 \\floor$0", options: "mA", description: "Floor" },
  { trigger: "lr(", replacement: "\\left( $1 \\right)$0", options: "mA", description: "Auto left/right parens" },
  { trigger: "lr[", replacement: "\\left[ $1 \\right]$0", options: "mA", description: "Auto left/right brackets" },
  { trigger: "lr{", replacement: "\\left\\{ $1 \\right\\}$0", options: "mA", description: "Auto left/right braces" },
  { trigger: "lr|", replacement: "\\left| $1 \\right|$0", options: "mA", description: "Auto left/right vertical" },

  // ── Calculus & Analysis ──
  { trigger: "ee", replacement: "e^{$1}$0", options: "mA", description: "Exponential" },
  { trigger: "oo", replacement: "\\infty", options: "mA", description: "Infinity" },
  { trigger: "sum", replacement: "\\sum_{${1:i=1}}^{${2:n}} $0", options: "mA", description: "Summation" },
  { trigger: "int", replacement: "\\int_{${1:a}}^{${2:b}} $0", options: "mA", description: "Definite Integral" },
  { trigger: "dint", replacement: "\\iint_{${1:S}} $0", options: "mA", description: "Double Integral" },
  { trigger: "tint", replacement: "\\iiint_{${1:V}} $0", options: "mA", description: "Triple Integral" },
  { trigger: "lim", replacement: "\\lim_{${1:n \\to \\infty}} $0", options: "mA", description: "Limit" },
  { trigger: "par", replacement: "\\frac{\\partial $1}{\\partial $2}$0", options: "mA", description: "Partial derivative" },
  { trigger: "ddx", replacement: "\\frac{d $1}{d $2}$0", options: "mA", description: "Leibniz derivative" },
  { trigger: "part", replacement: "\\partial ", options: "mA", description: "Partial symbol" },
  { trigger: "nabla", replacement: "\\nabla ", options: "mA", description: "Nabla" },
  { trigger: "grad", replacement: "\\nabla ", options: "mA", description: "Gradient" },
  { trigger: "div", replacement: "\\nabla \\cdot ", options: "mA", description: "Divergence" },
  { trigger: "curl", replacement: "\\nabla \\times ", options: "mA", description: "Curl" },

  // ── Fonts & Text ──
  { trigger: "tt", replacement: "\\text{$1}$0", options: "mA", description: "Text mode" },
  { trigger: "mbb", replacement: "\\mathbb{$1}$0", options: "mA", description: "Mathbb font" },
  { trigger: "mcal", replacement: "\\mathcal{$1}$0", options: "mA", description: "Mathcal font" },
  { trigger: "mbf", replacement: "\\mathbf{$1}$0", options: "mA", description: "Mathbf font" },
  { trigger: "mrm", replacement: "\\mathrm{$1}$0", options: "mA", description: "Mathrm font" },

  // ── Lowercase Greek ──
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

  // ── Uppercase Greek ──
  { trigger: "Ga", replacement: "\\Gamma", options: "mA", description: "Capital Gamma" },
  { trigger: "De", replacement: "\\Delta", options: "mA", description: "Capital Delta" },
  { trigger: "Th", replacement: "\\Theta", options: "mA", description: "Capital Theta" },
  { trigger: "La", replacement: "\\Lambda", options: "mA", description: "Capital Lambda" },
  { trigger: "Xi", replacement: "\\Xi", options: "mA", description: "Capital Xi" },
  { trigger: "Pi", replacement: "\\Pi", options: "mA", description: "Capital Pi" },
  { trigger: "Si", replacement: "\\Sigma", options: "mA", description: "Capital Sigma" },
  { trigger: "Ph", replacement: "\\Phi", options: "mA", description: "Capital Phi" },
  { trigger: "Ps", replacement: "\\Psi", options: "mA", description: "Capital Psi" },
  { trigger: "Om", replacement: "\\Omega", options: "mA", description: "Capital Omega" },
];
