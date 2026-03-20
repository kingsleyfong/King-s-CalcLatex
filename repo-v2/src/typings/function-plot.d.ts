/**
 * Type declarations for function-plot (D3-based math graphing library).
 * function-plot does not ship its own types.
 */
declare module "function-plot" {
  interface FunctionPlotOptions {
    /** Target DOM element or CSS selector */
    target: HTMLElement | string;
    width?: number;
    height?: number;
    xAxis?: AxisOptions;
    yAxis?: AxisOptions;
    grid?: boolean;
    /** Array of functions to plot */
    data: FunctionPlotDatum[];
    /** Disable mouse zoom */
    disableZoom?: boolean;
    /** Tooltip configuration */
    tip?: TipOptions;
    /** Annotations (vertical/horizontal lines, text) */
    annotations?: AnnotationOptions[];
  }

  interface AxisOptions {
    domain?: [number, number];
    label?: string;
    type?: "linear" | "log";
  }

  interface FunctionPlotDatum {
    /**
     * Expression string evaluated by function-plot's built-in parser.
     * Supports: x, y, sin, cos, tan, sqrt, log, exp, abs, etc.
     * For implicit: expression is f(x,y) and the zero contour is plotted.
     */
    fn?: string;
    /** Graph rendering type */
    graphType?: "polyline" | "scatter" | "interval";
    /** Function type for parsing */
    fnType?: "linear" | "implicit" | "parametric" | "polar" | "points";
    /** For parametric: x(t) expression */
    x?: string;
    /** For parametric: y(t) expression */
    y?: string;
    /** Line/point color */
    color?: string;
    /** Parameter range for parametric/polar (default [-Infinity, Infinity]) */
    range?: [number, number];
    /** Number of sample points */
    nSamples?: number;
    /** Close the path (for filled regions) */
    closed?: boolean;
    /** For points fnType: array of [x, y] pairs */
    points?: [number, number][];
    /** Disable tooltip for this datum */
    skipTip?: boolean;
    /** Custom attributes for the SVG element */
    attr?: Record<string, string>;
    /** Derivative information */
    derivative?: { fn: string; updateOnMouseMove?: boolean };
    /** Secant line information */
    secants?: { x0: number; updateOnMouseMove?: boolean }[];
  }

  interface TipOptions {
    xLine?: boolean;
    yLine?: boolean;
    renderer?: (x: number, y: number, index: number) => string;
  }

  interface AnnotationOptions {
    x?: number;
    y?: number;
    text?: string;
  }

  interface FunctionPlotInstance {
    /** Re-render the chart */
    draw(): void;
    /** The target container element */
    target: HTMLElement;
    /** Current options */
    options: FunctionPlotOptions;
  }

  /**
   * Create an interactive 2D math graph.
   * Supports explicit y=f(x), implicit f(x,y)=0, parametric (x(t),y(t)), and polar r(θ).
   * Uses interval arithmetic for robust implicit curve rendering.
   */
  export default function functionPlot(options: FunctionPlotOptions): FunctionPlotInstance;
}
