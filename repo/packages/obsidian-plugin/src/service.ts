import type {
  ConvertResponse,
  EvaluateResponse,
  PersistResponse,
  PlotResponse,
} from "./types";

export class EngineClient {
  constructor(private readonly baseUrl: string) {}

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const data = await response.json();
      return data.ok === true;
    } catch {
      return false;
    }
  }

  async evaluate(latex: string, mode: string): Promise<EvaluateResponse> {
    const response = await fetch(`${this.baseUrl}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex, mode }),
    });
    return await response.json();
  }

  async persist(latex: string): Promise<PersistResponse> {
    const response = await fetch(`${this.baseUrl}/persist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex }),
    });
    return await response.json();
  }

  async plot(latex: string, mode: string, ranges?: any, parameters?: any): Promise<PlotResponse> {
    const response = await fetch(`${this.baseUrl}/plot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex, mode, ranges, parameters }),
    });
    return await response.json();
  }

  async convert(value: number, from_unit: string, to_unit: string): Promise<ConvertResponse> {
    const response = await fetch(`${this.baseUrl}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, from_unit, to_unit }),
    });
    return await response.json();
  }
}
