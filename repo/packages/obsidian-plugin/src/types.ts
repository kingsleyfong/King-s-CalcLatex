export interface KingsCalcLatexSettings {
  engineBaseUrl: string;
  completionKey: string;
}

export interface Diagnostic {
  level: "info" | "warning" | "error";
  message: string;
}

export interface EvaluateResponse {
  ok: boolean;
  resultLatex: string;
  resultText: string;
  diagnostics: Diagnostic[];
}

export interface PlotResponse {
  ok: boolean;
  renderHtml: string;
  variables: string[];
  diagnostics: Diagnostic[];
}

export interface PersistResponse {
  ok: boolean;
  storedSymbol: string;
  diagnostics: Diagnostic[];
}

export interface ConvertResponse {
  ok: boolean;
  resultValue: number;
  resultText: string;
  diagnostics: Diagnostic[];
}

export interface InspectorState {
  title: string;
  summary: string;
  diagnostics: string[];
  renderHtml?: string;
  latex?: string;
  mode?: string;
  variables?: string[];
  params?: Record<string, number>;
  ranges?: Record<string, { min: number; max: number }>;
}
