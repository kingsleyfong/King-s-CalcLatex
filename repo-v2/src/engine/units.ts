/**
 * King's CalcLatex v2 — Unit Conversion
 *
 * Wraps math.js's unit system to provide engineering-friendly unit
 * conversions. Supports SI, imperial, temperature, and angle units.
 */

import { unit, format } from "mathjs";
import type { Result, Diagnostic } from "../types";
import { ok, err } from "../types";

/**
 * Convert a numeric value from one unit to another.
 *
 * Uses math.js's unit system, which supports a wide range of
 * engineering units including:
 * - Length: m, cm, mm, km, in, ft, yd, mi
 * - Mass: kg, g, mg, lb, oz
 * - Temperature: degC, degF, K
 * - Angle: rad, deg
 * - Force: N, lbf, kN
 * - Pressure: Pa, kPa, MPa, psi, atm, bar
 * - Energy: J, kJ, cal, kcal, BTU, kWh
 * - Power: W, kW, hp
 * - Volume: L, mL, gal, floz
 * - Time: s, min, hr (or hour), day
 * - Speed: m/s, km/h, mph
 *
 * @param value - Numeric value to convert
 * @param fromUnit - Source unit string (math.js-compatible)
 * @param toUnit - Target unit string (math.js-compatible)
 * @returns Formatted result string, e.g. "25.4 mm"
 */
export function convertUnits(
  value: number,
  fromUnit: string,
  toUnit: string,
): Result<string> {
  const diagnostics: Diagnostic[] = [];

  // Validate inputs
  if (!Number.isFinite(value)) {
    return err("Value must be a finite number");
  }
  if (!fromUnit || fromUnit.trim().length === 0) {
    return err("Source unit is required");
  }
  if (!toUnit || toUnit.trim().length === 0) {
    return err("Target unit is required");
  }

  // Normalize common aliases that users might type
  const normalizedFrom = normalizeUnit(fromUnit);
  const normalizedTo = normalizeUnit(toUnit);

  try {
    const source = unit(value, normalizedFrom);
    const converted = source.to(normalizedTo);

    // Format with reasonable precision (up to 12 significant digits, trimming trailing zeros)
    const formatted = format(converted, { notation: "auto", precision: 12 });

    diagnostics.push({
      level: "info",
      message: `Converted ${value} ${fromUnit} to ${toUnit}`,
    });

    return ok(formatted, diagnostics);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    // Provide user-friendly error messages for common issues
    if (message.includes("Unknown unit")) {
      return err(
        `Unknown unit: check that "${fromUnit}" and "${toUnit}" are valid. ` +
        `Common units: m, ft, kg, lb, degC, degF, rad, deg, Pa, psi, N, J, W`,
        diagnostics,
      );
    }
    if (message.includes("dimensions do not match") || message.includes("Cannot convert")) {
      return err(
        `Cannot convert ${fromUnit} to ${toUnit}: incompatible unit dimensions. ` +
        `You can only convert between units of the same physical quantity.`,
        diagnostics,
      );
    }

    return err(`Unit conversion failed: ${message}`, diagnostics);
  }
}

/**
 * Normalize common unit aliases to math.js-compatible names.
 */
function normalizeUnit(u: string): string {
  const trimmed = u.trim();
  const lower = trimmed.toLowerCase();

  // Temperature aliases
  if (lower === "c" || lower === "celsius" || lower === "°c") return "degC";
  if (lower === "f" || lower === "fahrenheit" || lower === "°f") return "degF";
  if (lower === "kelvin") return "K";

  // Angle aliases
  if (lower === "degrees" || lower === "degree") return "deg";
  if (lower === "radians" || lower === "radian") return "rad";

  // Pressure aliases
  if (lower === "mpa") return "MPa";
  if (lower === "kpa") return "kPa";
  if (lower === "gpa") return "GPa";

  // Energy
  if (lower === "kwh") return "kWh";

  // Force
  if (lower === "kn") return "kN";

  // Volume
  if (lower === "ml") return "mL";
  if (lower === "l" || lower === "liter" || lower === "litre") return "L";

  // Time
  if (lower === "hours" || lower === "hour") return "hr";
  if (lower === "minutes" || lower === "minute") return "min";
  if (lower === "seconds" || lower === "second") return "s";

  // Length
  if (lower === "inches" || lower === "inch") return "in";
  if (lower === "feet" || lower === "foot") return "ft";
  if (lower === "yards" || lower === "yard") return "yd";
  if (lower === "miles" || lower === "mile") return "mi";
  if (lower === "meters" || lower === "meter" || lower === "metre") return "m";
  if (lower === "centimeters" || lower === "centimeter") return "cm";
  if (lower === "millimeters" || lower === "millimeter") return "mm";
  if (lower === "kilometers" || lower === "kilometer") return "km";

  // Mass
  if (lower === "pounds" || lower === "pound") return "lb";
  if (lower === "ounces" || lower === "ounce") return "oz";
  if (lower === "grams" || lower === "gram") return "g";
  if (lower === "kilograms" || lower === "kilogram") return "kg";

  return trimmed;
}
