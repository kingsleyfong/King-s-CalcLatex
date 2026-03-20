/**
 * King's CalcLatex v2 — Parameter Slider Controls
 *
 * Creates interactive range sliders for free variables detected in
 * a plotted expression. Each slider lets the user adjust a parameter
 * value and triggers a callback to re-render the graph.
 */

/**
 * Create parameter sliders for each free variable.
 *
 * @param container  Parent element to append slider rows into
 * @param freeVars   List of free variable names (e.g. ["a", "b"])
 * @param onChange    Callback fired whenever any slider value changes,
 *                    with the full map of variable → current value
 */
export function createParameterControls(
  container: HTMLElement,
  freeVars: string[],
  onChange: (params: Record<string, number>) => void,
): void {
  const sliders: Map<string, HTMLInputElement> = new Map();

  for (const varName of freeVars) {
    const row = document.createElement("div");
    row.className = "kcl-slider-row";

    // Variable label
    const label = document.createElement("span");
    label.className = "kcl-slider-label";
    label.textContent = varName;
    row.appendChild(label);

    // Range slider
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "kcl-slider-input";
    slider.min = "-5";
    slider.max = "5";
    slider.step = "0.1";
    slider.value = "1";
    row.appendChild(slider);

    // Current value display
    const valueDisplay = document.createElement("span");
    valueDisplay.className = "kcl-slider-value";
    valueDisplay.textContent = "1";
    row.appendChild(valueDisplay);

    sliders.set(varName, slider);

    // Update display and fire callback on input
    slider.addEventListener("input", () => {
      valueDisplay.textContent = slider.value;
      onChange(collectValues(sliders));
    });

    container.appendChild(row);
  }
}

/**
 * Remove all slider elements from a container.
 */
export function destroyParameterControls(container: HTMLElement): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

/**
 * Collect current numeric values from all sliders.
 */
function collectValues(
  sliders: Map<string, HTMLInputElement>,
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [name, slider] of sliders) {
    params[name] = parseFloat(slider.value);
  }
  return params;
}
