/**
 * King's CalcLatex v2 — 3D Graph Renderer (Desmos-style Fixed Cube)
 *
 * Renders 3D graphs via Three.js with a fixed bounding cube architecture.
 * All geometry lives in a worldGroup that maps math coordinates into a
 * normalized [-1,1]³ cube. Zoom rescales the math ranges — the camera
 * never moves closer or farther. OrbitControls allow rotation only.
 *
 * Supports: explicit z=f(x,y), implicit f(x,y,z)=0 (marching cubes),
 * parametric curves (x(t),y(t),z(t)), and literal vectors.
 */

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Mesh,
  MeshPhongMaterial,
  MeshBasicMaterial,
  Color,
  AmbientLight,
  DirectionalLight,
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  Line,
  LineBasicMaterial,
  LineSegments,
  ArrowHelper,
  Vector3,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  BoxGeometry,
  EdgesGeometry,
  Group,
  CylinderGeometry,
  ConeGeometry,
  SphereGeometry,
  Raycaster,
  Vector2,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PlotSpec, PlotData, GraphHandle, AxisRanges } from "../types";
import { COLORS, COLORS_HEX } from "./colors";

// ── Constants ────────────────────────────────────────────────────────

const GRID_RESOLUTION = 80;    // vertices per axis for explicit_3d surfaces
const MC_RESOLUTION   = 40;    // grid cells per axis for marching cubes
const PARAM_SAMPLES   = 500;   // sample count for parametric curves
const VECTOR_COLOR    = 0xef553b;
const DARK_BG         = 0x1a1a2e;
const LIGHT_BG        = 0xf5f5f5;

// Axis colors: X=red, Y(math)=green, Z(math)=blue
const COLOR_X      = 0xff4d4d;
const COLOR_Y_MATH = 0x44cc44;  // math Y → Three.js Z
const COLOR_Z_MATH = 0x4488ff;  // math Z → Three.js Y

const COLOR_X_CSS      = "#ff4d4d";
const COLOR_Y_MATH_CSS = "#44cc44";
const COLOR_Z_MATH_CSS = "#4488ff";

// Axis geometry
const AXIS_RADIUS  = 0.012;
const AXIS_LENGTH  = 2.2;  // from -1.1 to +1.1
const ARROW_RADIUS = 0.035;
const ARROW_HEIGHT = 0.08;

// Camera (fixed position, never moves closer/farther)
const CAM_FOV  = 35;
const CAM_POS  = new Vector3(3.2, 2.4, 3.2);
const CAM_NEAR = 0.1;
const CAM_FAR  = 100;

// Zoom
const ZOOM_FACTOR = 1.15;
// Geometry is rebuilt on every zoom (debounced) so the surface always fills the cube.
const REBUILD_DEBOUNCE_MS = 150;

// ── Helpers ──────────────────────────────────────────────────────────

function showError(container: HTMLElement, message: string): void {
  const div = document.createElement("div");
  div.className = "kcl-graph-error";
  div.style.cssText =
    "padding:12px;color:#e55;font-size:13px;font-family:monospace;" +
    "border:1px solid #e55;border-radius:4px;background:#2a1515;";
  div.textContent = `3D Graph error: ${message}`;
  container.appendChild(div);
}

function niceStep(roughStep: number): number {
  if (roughStep <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const norm = roughStep / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-10) return "0";
  if (Number.isInteger(value) && Math.abs(value) < 1e6) return String(value);
  if (Math.abs(value) >= 1e4 || Math.abs(value) < 0.01) return value.toExponential(1);
  const s = value.toPrecision(3);
  return parseFloat(s).toString();
}

function scaleRange(range: [number, number], factor: number): [number, number] {
  const center = (range[0] + range[1]) / 2;
  const halfSpan = ((range[1] - range[0]) / 2) * factor;
  return [center - halfSpan, center + halfSpan];
}

function scaleRangeOrigin(range: [number, number], factor: number): [number, number] {
  const halfSpan = ((range[1] - range[0]) / 2) * factor;
  return [-halfSpan, halfSpan];
}

function cloneRanges(r: AxisRanges): AxisRanges {
  const out: AxisRanges = {
    x: [r.x[0], r.x[1]],
    y: [r.y[0], r.y[1]],
  };
  if (r.z) out.z = [r.z[0], r.z[1]];
  if (r.t) out.t = [r.t[0], r.t[1]];
  return out;
}

function rangeSpan(range: [number, number]): number {
  return range[1] - range[0];
}

function rangeCenter(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

/**
 * Map a normalized height t ∈ [0,1] to an RGB color using a 5-stop
 * Desmos-style gradient:
 *   t=0.00 → deep blue  (0.05, 0.15, 0.65)
 *   t=0.25 → cyan       (0.00, 0.75, 0.85)
 *   t=0.50 → green      (0.15, 0.85, 0.25)
 *   t=0.75 → yellow     (0.95, 0.85, 0.10)
 *   t=1.00 → red        (0.90, 0.15, 0.10)
 */
function heightToColor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.00, [0.05, 0.15, 0.65]],
    [0.25, [0.00, 0.75, 0.85]],
    [0.50, [0.15, 0.85, 0.25]],
    [0.75, [0.95, 0.85, 0.10]],
    [1.00, [0.90, 0.15, 0.10]],
  ];

  // Clamp t to [0, 1]
  const tc = Math.max(0, Math.min(1, t));

  // Find surrounding stops and linearly interpolate
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (tc <= t1) {
      const alpha = (tc - t0) / (t1 - t0);
      return [
        c0[0] + alpha * (c1[0] - c0[0]),
        c0[1] + alpha * (c1[1] - c0[1]),
        c0[2] + alpha * (c1[2] - c0[2]),
      ];
    }
  }

  // Fallback: return the last stop color
  return stops[stops.length - 1][1];
}

// ── Surface Builders ─────────────────────────────────────────────────

/**
 * Build a triangulated mesh for z = f(x,y) over the given ranges.
 * Geometry is in math coordinates with y/z swap for Three.js Y-up.
 */
function buildExplicit3DMesh(
  fn: (x: number, y: number) => number,
  ranges: AxisRanges,
  resolution: number,
): BufferGeometry {
  const xMin = ranges.x[0], xMax = ranges.x[1];
  const yMin = ranges.y[0], yMax = ranges.y[1];
  const nx = resolution, ny = resolution;
  const dx = (xMax - xMin) / (nx - 1);
  const dy = (yMax - yMin) / (ny - 1);

  const zRange = ranges.z || ranges.y;
  const zLo = zRange[0], zHi = zRange[1];

  const zValues: number[][] = [];
  for (let i = 0; i < nx; i++) {
    zValues[i] = [];
    for (let j = 0; j < ny; j++) {
      const x = xMin + i * dx;
      const y = yMin + j * dy;
      let z: number;
      try { z = fn(x, y); } catch { z = NaN; }
      // Clip: discard vertices outside z range (NaN → triangle skipped)
      // instead of clamping (which creates flat caps at cube boundaries).
      zValues[i][j] = (isFinite(z) && z >= zLo && z <= zHi) ? z : NaN;
    }
  }

  // ── Find zMin/zMax across all valid vertices for height coloring ──
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const z = zValues[i][j];
      if (!isNaN(z)) {
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      }
    }
  }
  const zSpanValid = zMax - zMin;
  const flatSurface = zSpanValid < 1e-10 || !isFinite(zSpanValid);

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const x = xMin + i * dx;
      const y = yMin + j * dy;
      const z = zValues[i][j];
      positions.push(x, z, y); // Three.js Y-up: swap y/z

      // Height-based vertex color
      let r: number, g: number, b: number;
      if (flatSurface || isNaN(z)) {
        // Flat surface or invalid vertex → uniform mid-color (green)
        [r, g, b] = [0.15, 0.85, 0.25];
      } else {
        const t = (z - zMin) / zSpanValid;
        [r, g, b] = heightToColor(t);
      }
      colors.push(r, g, b);
    }
  }

  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < ny - 1; j++) {
      const z00 = zValues[i][j];
      const z10 = zValues[i + 1][j];
      const z01 = zValues[i][j + 1];
      const z11 = zValues[i + 1][j + 1];
      if (isNaN(z00) || isNaN(z10) || isNaN(z01) || isNaN(z11)) continue;

      const idx00 = i * ny + j;
      const idx10 = (i + 1) * ny + j;
      const idx01 = i * ny + (j + 1);
      const idx11 = (i + 1) * ny + (j + 1);

      indices.push(idx00, idx10, idx01);
      indices.push(idx10, idx11, idx01);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Build a mesh for f(x,y,z)=0 using simplified marching cubes.
 */
function buildImplicit3DMesh(
  fn: (x: number, y: number, z: number) => number,
  ranges: AxisRanges,
  resolution: number,
): BufferGeometry | null {
  const xMin = ranges.x[0], xMax = ranges.x[1];
  const yMin = ranges.y[0], yMax = ranges.y[1];
  const zRange = ranges.z || [
    Math.min(ranges.x[0], ranges.y[0]),
    Math.max(ranges.x[1], ranges.y[1]),
  ];
  const zMin = zRange[0], zMax = zRange[1];

  const n = resolution;
  const dx = (xMax - xMin) / n;
  const dy = (yMax - yMin) / n;
  const dz = (zMax - zMin) / n;

  const values = new Float32Array((n + 1) * (n + 1) * (n + 1));
  const idx = (i: number, j: number, k: number) =>
    i * (n + 1) * (n + 1) + j * (n + 1) + k;

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      for (let k = 0; k <= n; k++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        const z = zMin + k * dz;
        try { values[idx(i, j, k)] = fn(x, y, z); }
        catch { values[idx(i, j, k)] = NaN; }
      }
    }
  }

  const vertices: number[] = [];

  function lerp(
    i0: number, j0: number, k0: number,
    i1: number, j1: number, k1: number,
  ): [number, number, number] | null {
    const v0 = values[idx(i0, j0, k0)];
    const v1 = values[idx(i1, j1, k1)];
    if (isNaN(v0) || isNaN(v1)) return null;
    if (v0 === v1) return null;
    const t = v0 / (v0 - v1);
    const x = xMin + (i0 + t * (i1 - i0)) * dx;
    const y = yMin + (j0 + t * (j1 - j0)) * dy;
    const z = zMin + (k0 + t * (k1 - k0)) * dz;
    return [x, z, y]; // Three.js Y-up: swap y/z
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const c = [
          values[idx(i, j, k)],
          values[idx(i + 1, j, k)],
          values[idx(i + 1, j + 1, k)],
          values[idx(i, j + 1, k)],
          values[idx(i, j, k + 1)],
          values[idx(i + 1, j, k + 1)],
          values[idx(i + 1, j + 1, k + 1)],
          values[idx(i, j + 1, k + 1)],
        ];

        let hasPositive = false;
        let hasNegative = false;
        for (let ci = 0; ci < 8; ci++) {
          if (isNaN(c[ci])) continue;
          if (c[ci] > 0) hasPositive = true;
          if (c[ci] < 0) hasNegative = true;
        }
        if (!hasPositive || !hasNegative) continue;

        const edgePairs: [[number, number, number], [number, number, number]][] = [
          [[i, j, k], [i + 1, j, k]],
          [[i + 1, j, k], [i + 1, j + 1, k]],
          [[i + 1, j + 1, k], [i, j + 1, k]],
          [[i, j + 1, k], [i, j, k]],
          [[i, j, k + 1], [i + 1, j, k + 1]],
          [[i + 1, j, k + 1], [i + 1, j + 1, k + 1]],
          [[i + 1, j + 1, k + 1], [i, j + 1, k + 1]],
          [[i, j + 1, k + 1], [i, j, k + 1]],
          [[i, j, k], [i, j, k + 1]],
          [[i + 1, j, k], [i + 1, j, k + 1]],
          [[i + 1, j + 1, k], [i + 1, j + 1, k + 1]],
          [[i, j + 1, k], [i, j + 1, k + 1]],
        ];

        const crossings: [number, number, number][] = [];
        for (const [a, b] of edgePairs) {
          const va = values[idx(a[0], a[1], a[2])];
          const vb = values[idx(b[0], b[1], b[2])];
          if (isNaN(va) || isNaN(vb)) continue;
          if ((va > 0) !== (vb > 0)) {
            const pt = lerp(a[0], a[1], a[2], b[0], b[1], b[2]);
            if (pt) crossings.push(pt);
          }
        }

        if (crossings.length >= 3) {
          let cx = 0, cy = 0, cz = 0;
          for (const [px, py, pz] of crossings) {
            cx += px; cy += py; cz += pz;
          }
          cx /= crossings.length;
          cy /= crossings.length;
          cz /= crossings.length;

          for (let fi = 0; fi < crossings.length; fi++) {
            const next = (fi + 1) % crossings.length;
            vertices.push(cx, cy, cz);
            vertices.push(crossings[fi][0], crossings[fi][1], crossings[fi][2]);
            vertices.push(crossings[next][0], crossings[next][1], crossings[next][2]);
          }
        }
      }
    }
  }

  if (vertices.length === 0) return null;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Detect if an implicit function f(x,y,z) is a plane (linear: ax+by+cz+d=0).
 * Returns {a, b, c, d} coefficients if linear, or null if not.
 */
function detectPlane(
  fn: (x: number, y: number, z: number) => number,
): { a: number; b: number; c: number; d: number } | null {
  try {
    // Evaluate at origin to get d
    const d = fn(0, 0, 0);
    if (!isFinite(d)) return null;

    // Compute partial derivatives via finite differences at origin
    const a = fn(1, 0, 0) - d;
    const b = fn(0, 1, 0) - d;
    const c = fn(0, 0, 1) - d;

    if (!isFinite(a) || !isFinite(b) || !isFinite(c)) return null;

    // If truly linear, f(x,y,z) = ax + by + cz + d for ALL (x,y,z).
    // Verify at several test points to rule out nonlinear functions.
    const testPts: [number, number, number][] = [
      [2, 0, 0], [0, 2, 0], [0, 0, 2],
      [1, 1, 0], [1, 0, 1], [0, 1, 1],
      [1, 1, 1], [-1, 2, -3], [3, -2, 1],
    ];

    for (const [tx, ty, tz] of testPts) {
      const expected = a * tx + b * ty + c * tz + d;
      const actual = fn(tx, ty, tz);
      if (!isFinite(actual) || Math.abs(actual - expected) > 1e-6 * (Math.abs(expected) + 1)) {
        return null;
      }
    }

    // It's a plane: f = ax + by + cz + d = 0
    // Normalize so the plane equation is ax + by + cz + d = 0
    return { a, b, c, d };
  } catch {
    return null;
  }
}

/**
 * Build geometry for a plane ax+by+cz+d=0 clipped to the bounding box.
 * Computes the plane-AABB intersection polygon analytically (3-6 vertices),
 * then triangulates it as a fan.
 */
function buildPlane3DMesh(
  plane: { a: number; b: number; c: number; d: number },
  ranges: AxisRanges,
): BufferGeometry | null {
  const xMin = ranges.x[0], xMax = ranges.x[1];
  const yMin = ranges.y[0], yMax = ranges.y[1];
  const zRange = ranges.z || [Math.min(xMin, yMin), Math.max(xMax, yMax)];
  const zMin = zRange[0], zMax = zRange[1];

  const { a, b, c, d } = plane;

  // The 8 corners of the AABB
  const corners: [number, number, number][] = [
    [xMin, yMin, zMin], [xMax, yMin, zMin], [xMin, yMax, zMin], [xMax, yMax, zMin],
    [xMin, yMin, zMax], [xMax, yMin, zMax], [xMin, yMax, zMax], [xMax, yMax, zMax],
  ];

  // 12 edges of the box, as index pairs
  const edges: [number, number][] = [
    // Bottom face (z=zMin)
    [0, 1], [1, 3], [3, 2], [2, 0],
    // Top face (z=zMax)
    [4, 5], [5, 7], [7, 6], [6, 4],
    // Vertical edges
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  // Find intersection of plane with each edge
  const intersections: [number, number, number][] = [];
  for (const [i0, i1] of edges) {
    const [x0, y0, z0] = corners[i0];
    const [x1, y1, z1] = corners[i1];
    const v0 = a * x0 + b * y0 + c * z0 + d;
    const v1 = a * x1 + b * y1 + c * z1 + d;

    // Check if the plane crosses this edge (sign change) or touches endpoint exactly
    if ((v0 > 0) === (v1 > 0) && v0 !== 0 && v1 !== 0) continue;
    if (v0 === v1) {
      // Edge lies in the plane — add both endpoints
      intersections.push([x0, y0, z0], [x1, y1, z1]);
      continue;
    }

    const t = v0 / (v0 - v1);
    if (t < -1e-10 || t > 1 + 1e-10) continue;
    const tc = Math.max(0, Math.min(1, t));
    intersections.push([
      x0 + tc * (x1 - x0),
      y0 + tc * (y1 - y0),
      z0 + tc * (z1 - z0),
    ]);
  }

  if (intersections.length < 3) return null;

  // Remove near-duplicate points
  const EPS = 1e-8;
  const unique: [number, number, number][] = [];
  for (const pt of intersections) {
    let dup = false;
    for (const u of unique) {
      if (Math.abs(pt[0] - u[0]) < EPS &&
          Math.abs(pt[1] - u[1]) < EPS &&
          Math.abs(pt[2] - u[2]) < EPS) {
        dup = true;
        break;
      }
    }
    if (!dup) unique.push(pt);
  }

  if (unique.length < 3) return null;

  // Compute centroid
  let cx = 0, cy = 0, cz = 0;
  for (const [px, py, pz] of unique) { cx += px; cy += py; cz += pz; }
  cx /= unique.length; cy /= unique.length; cz /= unique.length;

  // Sort vertices by angle around centroid in the plane.
  // Build a local 2D coordinate system on the plane:
  const nLen = Math.sqrt(a * a + b * b + c * c);
  if (nLen < 1e-12) return null;
  const nx = a / nLen, ny = b / nLen, nz = c / nLen;

  // Pick a reference direction (u) perpendicular to normal
  let ux: number, uy: number, uz: number;
  if (Math.abs(nx) < 0.9) {
    // Cross normal with x-axis
    ux = 0; uy = nz; uz = -ny;
  } else {
    // Cross normal with y-axis
    ux = -nz; uy = 0; uz = nx;
  }
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= uLen; uy /= uLen; uz /= uLen;

  // v = n × u
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;

  // Compute angle of each vertex relative to centroid in (u, v) plane coords
  const angles: { pt: [number, number, number]; angle: number }[] = unique.map(pt => {
    const dx = pt[0] - cx, dy = pt[1] - cy, dz = pt[2] - cz;
    const projU = dx * ux + dy * uy + dz * uz;
    const projV = dx * vx + dy * vy + dz * vz;
    return { pt, angle: Math.atan2(projV, projU) };
  });
  angles.sort((a2, b2) => a2.angle - b2.angle);

  // Triangulate as fan from centroid, converting to Three.js coords (Y-up: swap y↔z)
  const vertices: number[] = [];
  for (let i = 0; i < angles.length; i++) {
    const next = (i + 1) % angles.length;
    const p0 = angles[i].pt;
    const p1 = angles[next].pt;
    // Center
    vertices.push(cx, cz, cy);  // Three.js: (x, z, y)
    vertices.push(p0[0], p0[2], p0[1]);
    vertices.push(p1[0], p1[2], p1[1]);
  }

  if (vertices.length === 0) return null;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Build a line geometry for a parametric 3D curve (x(t), y(t), z(t)).
 */
function buildParametric3DLine(
  fns: ((...args: number[]) => number)[],
  tRange: [number, number],
  samples: number,
): BufferGeometry {
  const [fnX, fnY, fnZ] = fns;
  const tMin = tRange[0], tMax = tRange[1];
  const dt = (tMax - tMin) / (samples - 1);

  const positions: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = tMin + i * dt;
    try {
      const x = fnX(t);
      const y = fnY(t);
      const z = fnZ(t);
      if (isFinite(x) && isFinite(y) && isFinite(z)) {
        positions.push(x, z, y); // Three.js Y-up: swap y/z
      }
    } catch {
      // skip
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

// ── Sprite / Label Helpers ───────────────────────────────────────────

/**
 * Create a text sprite for axis labels or tick marks.
 * Returns the sprite plus its disposables (texture, material).
 */
function createTextSprite(
  text: string,
  color: string,
  fontSize: number,
  spriteScale: number,
): { sprite: Sprite; disposables: { dispose(): void }[] } {
  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Fallback: return an invisible sprite
    const mat = new SpriteMaterial({ transparent: true, opacity: 0 });
    const sp = new Sprite(mat);
    return { sprite: sp, disposables: [mat] };
  }

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, size / 2, size / 2);

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(spriteScale, spriteScale, 1);

  return { sprite, disposables: [texture, material] };
}

// ── Frame Group Builders ─────────────────────────────────────────────

/**
 * Build the cube wireframe (edges of a 2x2x2 box centered at origin).
 */
function buildCubeWireframe(isDark: boolean): { mesh: LineSegments; disposables: { dispose(): void }[] } {
  const boxGeo = new BoxGeometry(2, 2, 2);
  const edges = new EdgesGeometry(boxGeo);
  const edgeMat = new LineBasicMaterial({
    color: isDark ? 0x555577 : 0xaaaacc,
    transparent: true,
    opacity: 0.6,
  });
  const wireframe = new LineSegments(edges, edgeMat);
  boxGeo.dispose(); // EdgesGeometry copies the data, we can dispose the source
  return { mesh: wireframe, disposables: [edges, edgeMat] };
}

/**
 * Build a bold axis cylinder + arrowhead cone.
 * `direction` is in Three.js space (x, y, or z).
 */
function buildAxis(
  direction: "x" | "y" | "z",
  color: number,
): { group: Group; disposables: { dispose(): void }[] } {
  const group = new Group();
  const disposables: { dispose(): void }[] = [];

  // Cylinder body (CylinderGeometry is along local Y by default)
  const cylGeo = new CylinderGeometry(AXIS_RADIUS, AXIS_RADIUS, AXIS_LENGTH, 8);
  const cylMat = new MeshBasicMaterial({ color });
  const cyl = new Mesh(cylGeo, cylMat);

  if (direction === "x") cyl.rotation.z = -Math.PI / 2;
  if (direction === "z") cyl.rotation.x = Math.PI / 2;

  group.add(cyl);
  disposables.push(cylGeo, cylMat);

  // Arrow cone at positive end
  const coneGeo = new ConeGeometry(ARROW_RADIUS, ARROW_HEIGHT, 12);
  const coneMat = new MeshBasicMaterial({ color });
  const cone = new Mesh(coneGeo, coneMat);

  const tipPos = AXIS_LENGTH / 2 + ARROW_HEIGHT / 2;
  if (direction === "x") {
    cone.position.set(tipPos, 0, 0);
    cone.rotation.z = -Math.PI / 2;
  } else if (direction === "y") {
    cone.position.set(0, tipPos, 0);
  } else {
    cone.position.set(0, 0, tipPos);
    cone.rotation.x = Math.PI / 2;
  }

  group.add(cone);
  disposables.push(coneGeo, coneMat);

  return { group, disposables };
}

/**
 * Build grid lines on the three visible cube faces (bottom, back, left).
 *
 * Positions are in [-1,1] normalized space (frameGroup scale).
 * tickPositions are the normalized positions along each axis where grid
 * lines should appear.
 */
function buildGridLines(
  xTicks: number[],
  yMathTicks: number[], // math Y ticks, placed along Three.js Z
  zMathTicks: number[], // math Z ticks, placed along Three.js Y
  isDark: boolean,
): { mesh: LineSegments; disposables: { dispose(): void }[] } {
  const positions: number[] = [];
  const gridColor = isDark ? 0x333355 : 0xccccdd;

  // Bottom face (Three.js Y = -1, i.e. XZ plane at bottom of cube)
  // = math XY plane at min-Z
  // Vertical lines (parallel to Three.js Z) at each X tick
  for (const nx of xTicks) {
    positions.push(nx, -1, -1);
    positions.push(nx, -1,  1);
  }
  // Horizontal lines (parallel to Three.js X) at each math-Y tick (Three.js Z)
  for (const nz of yMathTicks) {
    positions.push(-1, -1, nz);
    positions.push( 1, -1, nz);
  }

  // Back face (Three.js Z = -1, i.e. XY plane at back of cube)
  // = math XZ plane at min-Y
  // Vertical lines (parallel to Three.js Y) at each X tick
  for (const nx of xTicks) {
    positions.push(nx, -1, -1);
    positions.push(nx,  1, -1);
  }
  // Horizontal lines (parallel to Three.js X) at each math-Z tick (Three.js Y)
  for (const ny of zMathTicks) {
    positions.push(-1, ny, -1);
    positions.push( 1, ny, -1);
  }

  // Left face (Three.js X = -1, i.e. YZ plane at left of cube)
  // = math YZ plane at min-X
  // Vertical lines (parallel to Three.js Y) at each math-Y tick (Three.js Z)
  for (const nz of yMathTicks) {
    positions.push(-1, -1, nz);
    positions.push(-1,  1, nz);
  }
  // Horizontal lines (parallel to Three.js Z) at each math-Z tick (Three.js Y)
  for (const ny of zMathTicks) {
    positions.push(-1, ny, -1);
    positions.push(-1, ny,  1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({ color: gridColor });
  const mesh = new LineSegments(geometry, material);

  return { mesh, disposables: [geometry, material] };
}

/**
 * Compute normalized tick positions for a given math range.
 * Returns an array of values in [-1, 1] (positions in frameGroup space).
 */
function computeNormalizedTicks(range: [number, number]): { normPositions: number[]; mathValues: number[] } {
  const span = rangeSpan(range);
  const center = rangeCenter(range);
  const halfSpan = span / 2;
  const step = niceStep(span / 4);

  const normPositions: number[] = [];
  const mathValues: number[] = [];

  if (step <= 0 || !isFinite(step)) return { normPositions, mathValues };

  const firstTick = Math.ceil((range[0] + step * 0.01) / step) * step;
  for (let v = firstTick; v <= range[1] + step * 0.01; v += step) {
    const rounded = Math.round(v / step) * step;
    const normPos = (rounded - center) / halfSpan;
    if (Math.abs(normPos) > 1.02) continue;
    normPositions.push(normPos);
    mathValues.push(rounded);
  }

  return { normPositions, mathValues };
}

/**
 * Build small perpendicular tick mark line segments along all three axes.
 *
 * All positions are in frameGroup (normalized [-1,1]³) space.
 * Ticks are 2D: a short cross of two segments perpendicular to the axis,
 * placed at each tick position along the axis.
 *
 * Three.js convention (Y-up):
 *   Math X  → Three.js X
 *   Math Y  → Three.js Z
 *   Math Z  → Three.js Y
 */
function buildAxisTickMarks(
  xNormPositions: number[],   // normalized positions along Three.js X axis
  yMathNormPositions: number[], // normalized positions along Three.js Z axis (math Y)
  zMathNormPositions: number[], // normalized positions along Three.js Y axis (math Z)
  isDark: boolean,
): { mesh: LineSegments; disposables: { dispose(): void }[] } {
  const tickHalf = 0.035; // half-length of each tick segment in normalized space
  const positions: number[] = [];

  // X-axis ticks: axis runs along Three.js X at (_, 0, 0).
  // Draw a cross in the Y-Z plane at each tick x-position.
  for (const nx of xNormPositions) {
    // Vertical arm (Three.js Y direction)
    positions.push(nx, -tickHalf, 0,  nx, tickHalf, 0);
    // Depth arm (Three.js Z direction)
    positions.push(nx, 0, -tickHalf,  nx, 0, tickHalf);
  }

  // Math-Y-axis ticks: axis runs along Three.js Z at (0, 0, _).
  // Draw a cross in the X-Y plane at each tick z-position.
  for (const nz of yMathNormPositions) {
    // Horizontal arm (Three.js X direction)
    positions.push(-tickHalf, 0, nz,  tickHalf, 0, nz);
    // Vertical arm (Three.js Y direction)
    positions.push(0, -tickHalf, nz,  0, tickHalf, nz);
  }

  // Math-Z-axis ticks: axis runs along Three.js Y at (0, _, 0).
  // Draw a cross in the X-Z plane at each tick y-position.
  for (const ny of zMathNormPositions) {
    // Horizontal arm (Three.js X direction)
    positions.push(-tickHalf, ny, 0,  tickHalf, ny, 0);
    // Depth arm (Three.js Z direction)
    positions.push(0, ny, -tickHalf,  0, ny, tickHalf);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    color: isDark ? 0x888899 : 0x666677,
    transparent: true,
    opacity: 0.75,
  });
  const mesh = new LineSegments(geometry, material);

  return { mesh, disposables: [geometry, material] };
}

// ── Scene Object Builders (geometry in worldGroup) ───────────────────

function buildSceneObjects(
  worldGroup: Group,
  spec: PlotSpec,
  ranges: AxisRanges,
  disposables: { dispose(): void }[],
): void {
  for (let i = 0; i < spec.data.length; i++) {
    const pd = spec.data[i];
    const color = COLORS_HEX[i % COLORS_HEX.length];
    try {
      switch (pd.type) {
        case "explicit_3d":
          buildExplicit3D(worldGroup, pd, ranges, disposables, color);
          break;
        case "implicit_3d":
          buildImplicit3D(worldGroup, pd, ranges, disposables, color);
          break;
        case "parametric_3d":
          buildParametric3D(worldGroup, pd, ranges, disposables, color);
          break;
        case "vector_3d":
          buildVector3D(worldGroup, pd, disposables);
          break;
        case "point_3d":
          buildPoint3D(worldGroup, pd, ranges, disposables, color);
          break;
        case "vector_field_3d":
          buildVectorField3D(worldGroup, pd, ranges, disposables, color, spec.arrowScale);
          break;
        case "explicit_2d":
          // Plane-curve mode: 2D equation on a 3D graph drawn at z=0
          buildExplicit2DOn3D(worldGroup, pd, ranges, disposables, color);
          break;
        default:
          break;
      }
    } catch (e: unknown) {
      console.warn(`[KCL] Failed to build 3D object for ${pd.type}:`, e);
    }
  }
}

function buildExplicit3D(
  parent: Group,
  pd: PlotData,
  ranges: AxisRanges,
  disposables: { dispose(): void }[],
  color: number,
): void {
  const fn = pd.compiledFns[0];
  if (!fn) return;

  const geometry = buildExplicit3DMesh(fn, ranges, GRID_RESOLUTION);
  const material = new MeshPhongMaterial({
    vertexColors: true,
    side: DoubleSide,
    transparent: true,
    opacity: 0.85,
    shininess: 30,
  });

  const mesh = new Mesh(geometry, material);
  parent.add(mesh);
  disposables.push(geometry, material, { dispose: () => parent.remove(mesh) });
}

function buildImplicit3D(
  parent: Group,
  pd: PlotData,
  ranges: AxisRanges,
  disposables: { dispose(): void }[],
  color: number,
): void {
  const fn = pd.compiledFns[0];
  if (!fn) return;

  // Try analytical plane detection first — produces clean full-box polygon
  const plane = detectPlane(fn);
  if (plane) {
    const geometry = buildPlane3DMesh(plane, ranges);
    if (geometry) {
      const material = new MeshPhongMaterial({
        color,
        side: DoubleSide,
        transparent: true,
        opacity: 0.75,
        shininess: 30,
        specular: 0x333333,
      });
      const mesh = new Mesh(geometry, material);
      parent.add(mesh);
      disposables.push(geometry, material, { dispose: () => parent.remove(mesh) });
      return;
    }
  }

  // Fallback: marching cubes for nonlinear implicit surfaces
  const geometry = buildImplicit3DMesh(fn, ranges, MC_RESOLUTION);
  if (!geometry) {
    console.warn("[KCL] Implicit 3D: no isosurface found in the given range.");
    return;
  }

  const material = new MeshPhongMaterial({
    color,
    side: DoubleSide,
    transparent: true,
    opacity: 0.75,
    shininess: 30,
    specular: 0x333333,
  });

  const mesh = new Mesh(geometry, material);
  parent.add(mesh);
  disposables.push(geometry, material, { dispose: () => parent.remove(mesh) });
}

function buildParametric3D(
  parent: Group,
  pd: PlotData,
  ranges: AxisRanges,
  disposables: { dispose(): void }[],
  color: number,
): void {
  if (pd.compiledFns.length < 3) return;

  const tRange: [number, number] = ranges.t || [-2 * Math.PI, 2 * Math.PI];
  const geometry = buildParametric3DLine(pd.compiledFns, tRange, PARAM_SAMPLES);
  const material = new LineBasicMaterial({ color, linewidth: 2 });

  const line = new Line(geometry, material);
  parent.add(line);
  disposables.push(geometry, material, { dispose: () => parent.remove(line) });
}

/**
 * Build a 3D line for a 2D equation at z=0 (plane-curve mode).
 * Samples x values and builds (x, 0, fn(x)) in Three.js coords.
 */
function buildExplicit2DOn3D(
  parent: Group,
  pd: PlotData,
  ranges: AxisRanges,
  disposables: { dispose(): void }[],
  color: number,
): void {
  const fn = pd.compiledFns[0];
  if (!fn) return;

  const xMin = ranges.x[0];
  const xMax = ranges.x[1];
  const samples = 500;
  const dx = (xMax - xMin) / (samples - 1);

  const positions: number[] = [];
  for (let i = 0; i < samples; i++) {
    const x = xMin + i * dx;
    let y: number;
    try { y = fn(x); } catch { continue; }
    if (!isFinite(y)) continue;
    // Three.js Y-up: math (x, y, z=0) → three.js (x, 0, y)
    positions.push(x, 0, y);
  }

  if (positions.length < 6) return;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({ color, linewidth: 3 });

  const line = new Line(geometry, material);
  parent.add(line);
  disposables.push(geometry, material, { dispose: () => parent.remove(line) });
}

function buildVector3D(
  parent: Group,
  pd: PlotData,
  disposables: { dispose(): void }[],
): void {
  if (pd.compiledFns.length < 3) return;

  const a = pd.compiledFns[0](0);
  const b = pd.compiledFns[1](0);
  const c = pd.compiledFns[2](0);
  if (!isFinite(a) || !isFinite(b) || !isFinite(c)) return;

  const dir = new Vector3(a, c, b).normalize(); // Three.js Y-up: swap y/z
  const length = Math.sqrt(a * a + b * b + c * c);
  const origin = new Vector3(0, 0, 0);

  const arrow = new ArrowHelper(dir, origin, length, VECTOR_COLOR, length * 0.15, length * 0.08);
  parent.add(arrow);
  disposables.push({ dispose: () => parent.remove(arrow) });
}

function buildPoint3D(
  parent: Group,
  pd: PlotData,
  ranges: AxisRanges,
  disposables: { dispose(): void }[],
  color: number,
): void {
  if (pd.compiledFns.length < 3) return;
  const a = pd.compiledFns[0]();
  const b = pd.compiledFns[1]();
  const c = pd.compiledFns[2]();
  if (!isFinite(a) || !isFinite(b) || !isFinite(c)) return;

  // Sphere radius in math-space: 3% of the largest range span so it's
  // visually constant regardless of worldGroup scaling (which maps
  // math coords → [-1,1]³). With uniform 1:1:1 scale, this produces
  // a sphere of ~0.06 in normalized cube space (clearly visible).
  const xSpan = ranges.x[1] - ranges.x[0];
  const ySpan = ranges.y[1] - ranges.y[0];
  const zSpan = (ranges.z || ranges.y)[1] - (ranges.z || ranges.y)[0];
  const radius = Math.max(xSpan, ySpan, zSpan) * 0.03;

  const geometry = new SphereGeometry(radius, 16, 12);
  const material = new MeshPhongMaterial({ color });
  const sphere = new Mesh(geometry, material);
  // Three.js Y-up: math (x, y, z) → Three.js (x, z, y)
  sphere.position.set(a, c, b);
  parent.add(sphere);
  disposables.push(geometry, material, { dispose: () => parent.remove(sphere) });
}

function buildVectorField3D(
  parent: Group,
  pd: PlotData,
  ranges: AxisRanges,
  disposables: { dispose(): void }[],
  color: number,
  arrowScaleFactor?: number,
): void {
  if (pd.compiledFns.length < 3) return;
  const fnP = pd.compiledFns[0];
  const fnQ = pd.compiledFns[1];
  const fnR = pd.compiledFns[2];

  const gridN = 6;
  const xMin = ranges.x[0], xMax = ranges.x[1];
  const yMin = ranges.y[0], yMax = ranges.y[1];
  const zRange = ranges.z || ranges.y;
  const zMin = zRange[0], zMax = zRange[1];

  const dx = (xMax - xMin) / gridN;
  const dy = (yMax - yMin) / gridN;
  const dz = (zMax - zMin) / gridN;

  const vecs: { x: number; y: number; z: number; vx: number; vy: number; vz: number }[] = [];
  let maxMag = 0;

  for (let i = 0; i < gridN; i++) {
    for (let j = 0; j < gridN; j++) {
      for (let k = 0; k < gridN; k++) {
        const x = xMin + (i + 0.5) * dx;
        const y = yMin + (j + 0.5) * dy;
        const z = zMin + (k + 0.5) * dz;
        let vx: number, vy: number, vz: number;
        try { vx = fnP(x, y, z); vy = fnQ(x, y, z); vz = fnR(x, y, z); } catch { continue; }
        if (!isFinite(vx) || !isFinite(vy) || !isFinite(vz)) continue;
        const mag = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (mag > maxMag) maxMag = mag;
        vecs.push({ x, y, z, vx, vy, vz });
      }
    }
  }

  if (maxMag === 0 || vecs.length === 0) return;

  const arrowScale = Math.min(dx, dy, dz) * 0.7 * (arrowScaleFactor ?? 1.0);

  for (const { x, y, z, vx, vy, vz } of vecs) {
    const mag = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (mag < maxMag * 1e-6) continue;

    const len = (mag / maxMag) * arrowScale;
    // Three.js Y-up: math (x,y,z) → Three.js (x,z,y)
    const dir = new Vector3(vx, vz, vy).normalize();
    const origin = new Vector3(x, z, y);

    const arrow = new ArrowHelper(dir, origin, len, color, len * 0.25, len * 0.12);
    parent.add(arrow);
    disposables.push({ dispose: () => { parent.remove(arrow); arrow.dispose(); } });
  }
}

/**
 * Dispose all tracked scene objects and clear the list.
 */
function disposeSceneObjects(disposables: { dispose(): void }[]): void {
  for (const d of disposables) {
    try { d.dispose(); } catch { /* ignore */ }
  }
  disposables.length = 0;
}

// ── Main Entry ───────────────────────────────────────────────────────

/**
 * Create a 3D graph inside `container` from the given PlotSpec.
 *
 * Architecture: fixed bounding cube. All geometry lives in worldGroup
 * (scaled to map math coordinates → [-1,1]³). Frame elements (cube wireframe,
 * axes, grid, ticks) live in frameGroup at fixed scale. Zoom changes math
 * ranges and updates worldGroup — camera never moves closer/farther.
 */
export function create3DGraph(
  container: HTMLElement,
  spec: PlotSpec,
  isDark: boolean,
  zoomMode: "origin" | "range-center" = "origin",
  showTicks = true,
): GraphHandle {
  let destroyed = false;
  let animationId: number | null = null;
  let renderer: WebGLRenderer | null = null;
  let scene: Scene | null = null;
  let camera: PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let needsRender = true;

  // Groups
  let frameGroup: Group | null = null;
  let worldGroup: Group | null = null;

  // Ranges: mutable current vs frozen initial
  const initialRanges: AxisRanges = cloneRanges(spec.ranges);
  let currentRanges: AxisRanges = cloneRanges(spec.ranges);

  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

  // Per-expression disposables (cleared on each spec update / rebuild)
  const geometryDisposables: { dispose(): void }[] = [];

  // Frame disposables: tick labels + tick mark segments + grid lines (regenerated on zoom)
  const tickDisposables: { dispose(): void }[] = [];
  const tickMarkDisposables: { dispose(): void }[] = [];
  const gridDisposables: { dispose(): void }[] = [];

  // Permanent frame disposables: cube wireframe, axes, axis name labels (only on destroy)
  const permanentFrameDisposables: { dispose(): void }[] = [];

  // Event listener references for cleanup
  let wheelHandler: ((e: WheelEvent) => void) | null = null;
  let dblclickHandler: (() => void) | null = null;
  let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  let mouseLeaveHandler: (() => void) | null = null;

  // HTML overlays (must be outer-scoped for destroy())
  let labelOverlay: HTMLElement | null = null;
  let tooltip: HTMLElement | null = null;

  try {
    // ── Scene Setup ──────────────────────────────────────────────

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;

    renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene = new Scene();
    scene.background = new Color(isDark ? DARK_BG : LIGHT_BG);

    camera = new PerspectiveCamera(CAM_FOV, width / height, CAM_NEAR, CAM_FAR);
    camera.position.copy(CAM_POS);
    camera.lookAt(0, 0, 0);

    // ── OrbitControls (rotation only) ────────────────────────────
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.8;
    controls.minDistance = 3;
    controls.maxDistance = 8;

    // ── Lighting ─────────────────────────────────────────────────
    const ambient = new AmbientLight(0xffffff, isDark ? 0.5 : 0.65);
    scene.add(ambient);

    const directional = new DirectionalLight(0xffffff, isDark ? 0.85 : 0.7);
    directional.position.set(3, 5, 4);
    scene.add(directional);

    const fill = new DirectionalLight(0xffffff, 0.2);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    // ── Groups ───────────────────────────────────────────────────
    frameGroup = new Group();
    worldGroup = new Group();
    scene.add(frameGroup);
    scene.add(worldGroup);

    // ── Cube Wireframe ───────────────────────────────────────────
    const cube = buildCubeWireframe(isDark);
    frameGroup.add(cube.mesh);
    permanentFrameDisposables.push(...cube.disposables, { dispose: () => frameGroup!.remove(cube.mesh) });

    // ── Bold Axes (Cylinders + Cones) ────────────────────────────
    // X axis (red): Three.js X direction
    const xAxis = buildAxis("x", COLOR_X);
    frameGroup.add(xAxis.group);
    permanentFrameDisposables.push(...xAxis.disposables, { dispose: () => frameGroup!.remove(xAxis.group) });

    // Math Y axis (green): Three.js Z direction
    const yMathAxis = buildAxis("z", COLOR_Y_MATH);
    frameGroup.add(yMathAxis.group);
    permanentFrameDisposables.push(...yMathAxis.disposables, { dispose: () => frameGroup!.remove(yMathAxis.group) });

    // Math Z axis (blue): Three.js Y direction
    const zMathAxis = buildAxis("y", COLOR_Z_MATH);
    frameGroup.add(zMathAxis.group);
    permanentFrameDisposables.push(...zMathAxis.disposables, { dispose: () => frameGroup!.remove(zMathAxis.group) });

    // ── Axis Name Labels ─────────────────────────────────────────
    // Axis name labels — at the positive tip of each axis (just past the arrow)
    const labelScale = 0.18;
    const labelFontSize = 80;
    const labelTip = AXIS_LENGTH / 2 + ARROW_HEIGHT + 0.06;

    const xLabel = createTextSprite("X", COLOR_X_CSS, labelFontSize, labelScale);
    xLabel.sprite.position.set(labelTip, 0, 0);
    frameGroup.add(xLabel.sprite);
    permanentFrameDisposables.push(...xLabel.disposables, { dispose: () => frameGroup!.remove(xLabel.sprite) });

    // Math Y label at Three.js +Z tip
    const yLabel = createTextSprite("Y", COLOR_Y_MATH_CSS, labelFontSize, labelScale);
    yLabel.sprite.position.set(0, 0, labelTip);
    frameGroup.add(yLabel.sprite);
    permanentFrameDisposables.push(...yLabel.disposables, { dispose: () => frameGroup!.remove(yLabel.sprite) });

    // Math Z label at Three.js +Y tip
    const zLabel = createTextSprite("Z", COLOR_Z_MATH_CSS, labelFontSize, labelScale);
    zLabel.sprite.position.set(0, labelTip, 0);
    frameGroup.add(zLabel.sprite);
    permanentFrameDisposables.push(...zLabel.disposables, { dispose: () => frameGroup!.remove(zLabel.sprite) });

    // ── World Transform ──────────────────────────────────────────
    updateWorldTransform();

    // ── Initial Grid + Ticks ─────────────────────────────────────
    regenerateGridLines();
    regenerateTickLabels();

    // ── Build Geometry ───────────────────────────────────────────
    buildSceneObjects(worldGroup, spec, currentRanges, geometryDisposables);

    // ── Expression Labels (HTML overlay) ─────────────────────────
    labelOverlay = createLabelOverlay(container, spec);

    // ── 3D Hover Coordinates (Raycaster + tooltip) ───────────────
    tooltip = document.createElement("div");
    tooltip.className = "kcl-graph-3d-tooltip";
    tooltip.style.display = "none";
    container.appendChild(tooltip);

    const raycaster = new Raycaster();
    const mouse = new Vector2();

    mouseMoveHandler = (e: MouseEvent) => {
      if (!renderer || !camera || !worldGroup) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(worldGroup.children, true);

      if (intersects.length > 0) {
        const pt = intersects[0].point;
        // Reverse coordinate transform: undo worldGroup scale/translate
        // Three.js (x, y, z) → math (x, z, y) since Three.js Y = math Z
        const wg = worldGroup!;
        const mathX = (pt.x - wg.position.x) / wg.scale.x;
        const mathZ = (pt.y - wg.position.y) / wg.scale.y;
        const mathY = (pt.z - wg.position.z) / wg.scale.z;

        const fx = parseFloat(mathX.toPrecision(3));
        const fy = parseFloat(mathY.toPrecision(3));
        const fz = parseFloat(mathZ.toPrecision(3));
        tooltip.textContent = `(${fx}, ${fy}, ${fz})`;
        tooltip.style.display = "block";
        tooltip.style.left = `${e.clientX - rect.left + 12}px`;
        tooltip.style.top = `${e.clientY - rect.top - 24}px`;
      } else {
        tooltip.style.display = "none";
      }
    };

    mouseLeaveHandler = () => {
      tooltip.style.display = "none";
    };

    renderer.domElement.addEventListener("mousemove", mouseMoveHandler);
    renderer.domElement.addEventListener("mouseleave", mouseLeaveHandler);

    // ── Custom Zoom (wheel → range scaling) ──────────────────────
    const canvas = renderer.domElement;

    wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const scaleFn = zoomMode === "origin" ? scaleRangeOrigin : scaleRange;

      currentRanges.x = scaleFn(currentRanges.x, factor);
      currentRanges.y = scaleFn(currentRanges.y, factor);
      if (currentRanges.z) {
        currentRanges.z = scaleFn(currentRanges.z, factor);
      }

      updateWorldTransform();
      regenerateTickLabels();
      regenerateGridLines();

      // Rebuild geometry at new ranges so surface fills the cube
      scheduleGeometryRebuild();

      needsRender = true;
    };
    canvas.addEventListener("wheel", wheelHandler, { passive: false });

    // ── Double-click to reset view ───────────────────────────────
    dblclickHandler = () => {
      currentRanges = cloneRanges(initialRanges);
      updateWorldTransform();
      regenerateTickLabels();
      regenerateGridLines();

      // Rebuild geometry at original ranges if it drifted
      scheduleGeometryRebuild();

      needsRender = true;
    };
    canvas.addEventListener("dblclick", dblclickHandler);

    // ── Animation Loop ───────────────────────────────────────────
    controls.addEventListener("change", () => { needsRender = true; });

    function animate(): void {
      if (destroyed) return;
      animationId = requestAnimationFrame(animate);
      if (controls) controls.update();
      if (needsRender && renderer && scene && camera) {
        renderer.render(scene, camera);
        needsRender = false;
      }
    }

    needsRender = true;
    animate();

    // ── Resize Observer ──────────────────────────────────────────
    resizeObserver = new ResizeObserver(() => {
      if (destroyed || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      needsRender = true;
    });
    resizeObserver.observe(container);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showError(container, msg);
  }

  // ── Internal Helpers ───────────────────────────────────────────

  function updateWorldTransform(): void {
    if (!worldGroup) return;

    const xRange = currentRanges.x;
    const yRange = currentRanges.y;
    const zRange = currentRanges.z || currentRanges.y;

    // Uniform scaling: all axes use the same scale factor so proportions
    // are preserved (1:1:1 axes). The largest axis fills [-1,1] in the
    // cube; shorter axes occupy a proportionally smaller fraction.
    // Three.js Y-up: math (x,y,z) → Three.js (x,z,y)

    if (zoomMode === "origin") {
      const halfX = Math.max(Math.abs(xRange[0]), Math.abs(xRange[1]));
      const halfY = Math.max(Math.abs(yRange[0]), Math.abs(yRange[1]));
      const halfZ = Math.max(Math.abs(zRange[0]), Math.abs(zRange[1]));

      const maxHalf = Math.max(halfX, halfY, halfZ, 1e-6);
      const s = 1 / maxHalf;

      worldGroup.scale.set(s, s, s);
      worldGroup.position.set(0, 0, 0);
    } else {
      const xCen = rangeCenter(xRange);
      const yCen = rangeCenter(yRange);
      const zCen = rangeCenter(zRange);

      const maxSpan = Math.max(rangeSpan(xRange), rangeSpan(yRange), rangeSpan(zRange), 1e-6);
      const s = 2 / maxSpan;

      worldGroup.scale.set(s, s, s);
      worldGroup.position.set(-xCen * s, -zCen * s, -yCen * s);
    }
  }

  function regenerateTickLabels(): void {
    if (!frameGroup) return;

    // Clear existing tick labels
    for (const d of tickDisposables) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    tickDisposables.length = 0;

    // Clear existing tick mark segments
    for (const d of tickMarkDisposables) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    tickMarkDisposables.length = 0;

    if (!showTicks) return;

    const xRange = currentRanges.x;
    const yRange = currentRanges.y;
    const zRange = currentRanges.z || currentRanges.y;

    const tickScale = 0.11;
    const tickFontSize = 52;
    const tickOff = 0.10; // perpendicular offset so labels don't overlap axis line

    // ── Tick mark segments ──────────────────────────────────
    const xTicks = computeNormalizedTicks(xRange);
    const yTicks = computeNormalizedTicks(yRange);
    const zTicks = computeNormalizedTicks(zRange);

    const tickMarks = buildAxisTickMarks(
      xTicks.normPositions,
      yTicks.normPositions,
      zTicks.normPositions,
      isDark,
    );
    frameGroup.add(tickMarks.mesh);
    tickMarkDisposables.push(...tickMarks.disposables, { dispose: () => frameGroup!.remove(tickMarks.mesh) });

    // ── Tick labels — X axis ────────────────────────────────
    // Along the X axis (near y=0, z=0), offset slightly down+back
    for (let i = 0; i < xTicks.normPositions.length; i++) {
      const normPos = xTicks.normPositions[i];
      const value = xTicks.mathValues[i];
      if (Math.abs(value) < 1e-10) continue;

      const label = createTextSprite(formatTick(value), COLOR_X_CSS, tickFontSize, tickScale);
      label.sprite.position.set(normPos, -tickOff, tickOff);
      frameGroup.add(label.sprite);
      tickDisposables.push(...label.disposables, { dispose: () => frameGroup!.remove(label.sprite) });
    }

    // ── Tick labels — Math Y axis ────────────────────────────
    // Along Three.js Z axis (near x=0, y=0), offset slightly left+down
    for (let i = 0; i < yTicks.normPositions.length; i++) {
      const normPos = yTicks.normPositions[i];
      const value = yTicks.mathValues[i];
      if (Math.abs(value) < 1e-10) continue;

      const label = createTextSprite(formatTick(value), COLOR_Y_MATH_CSS, tickFontSize, tickScale);
      label.sprite.position.set(-tickOff, -tickOff, normPos);
      frameGroup.add(label.sprite);
      tickDisposables.push(...label.disposables, { dispose: () => frameGroup!.remove(label.sprite) });
    }

    // ── Tick labels — Math Z axis ────────────────────────────
    // Along Three.js Y axis (near x=0, z=0), offset slightly left+back
    for (let i = 0; i < zTicks.normPositions.length; i++) {
      const normPos = zTicks.normPositions[i];
      const value = zTicks.mathValues[i];
      if (Math.abs(value) < 1e-10) continue;

      const label = createTextSprite(formatTick(value), COLOR_Z_MATH_CSS, tickFontSize, tickScale);
      label.sprite.position.set(tickOff, normPos, -tickOff);
      frameGroup.add(label.sprite);
      tickDisposables.push(...label.disposables, { dispose: () => frameGroup!.remove(label.sprite) });
    }
  }

  function regenerateGridLines(): void {
    if (!frameGroup) return;

    // Clear existing grid lines
    for (const d of gridDisposables) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    gridDisposables.length = 0;

    const xRange = currentRanges.x;
    const yRange = currentRanges.y;
    const zRange = currentRanges.z || currentRanges.y;

    const xTicks = computeNormalizedTicks(xRange).normPositions;
    const yMathTicks = computeNormalizedTicks(yRange).normPositions;  // → Three.js Z
    const zMathTicks = computeNormalizedTicks(zRange).normPositions;  // → Three.js Y

    const grid = buildGridLines(xTicks, yMathTicks, zMathTicks, isDark);
    frameGroup.add(grid.mesh);
    gridDisposables.push(...grid.disposables, { dispose: () => frameGroup!.remove(grid.mesh) });
  }

  function scheduleGeometryRebuild(): void {
    if (rebuildTimer !== null) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      rebuildGeometry();
    }, REBUILD_DEBOUNCE_MS);
  }

  function rebuildGeometry(): void {
    if (destroyed || !worldGroup) return;

    disposeSceneObjects(geometryDisposables);
    buildSceneObjects(worldGroup, spec, currentRanges, geometryDisposables);
    needsRender = true;
  }

  // ── GraphHandle ────────────────────────────────────────────────

  return {
    update(newSpec: PlotSpec): void {
      if (destroyed || !worldGroup || !scene) return;

      try {
        // Update the spec reference for future rebuilds
        spec = newSpec;

        // Update ranges
        currentRanges = cloneRanges(newSpec.ranges);

        // Dispose old geometry
        disposeSceneObjects(geometryDisposables);

        // Rebuild geometry with new spec
        buildSceneObjects(worldGroup, newSpec, currentRanges, geometryDisposables);

        // Update world transform for new ranges
        updateWorldTransform();
        regenerateTickLabels();
        regenerateGridLines();

        needsRender = true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        showError(container, msg);
      }
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;

      // Cancel pending rebuild
      if (rebuildTimer !== null) {
        clearTimeout(rebuildTimer);
        rebuildTimer = null;
      }

      // Stop animation loop
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }

      // Disconnect resize observer
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }

      // Remove event listeners
      if (renderer && wheelHandler) {
        renderer.domElement.removeEventListener("wheel", wheelHandler);
        wheelHandler = null;
      }
      if (renderer && dblclickHandler) {
        renderer.domElement.removeEventListener("dblclick", dblclickHandler);
        dblclickHandler = null;
      }
      if (renderer && mouseMoveHandler) {
        renderer.domElement.removeEventListener("mousemove", mouseMoveHandler);
        mouseMoveHandler = null;
      }
      if (renderer && mouseLeaveHandler) {
        renderer.domElement.removeEventListener("mouseleave", mouseLeaveHandler);
        mouseLeaveHandler = null;
      }
      // Remove label overlay and tooltip
      labelOverlay?.remove();
      tooltip?.remove();

      // Dispose controls
      if (controls) {
        controls.dispose();
        controls = null;
      }

      // Dispose tracked objects
      disposeSceneObjects(geometryDisposables);
      disposeSceneObjects(tickDisposables);
      disposeSceneObjects(tickMarkDisposables);
      disposeSceneObjects(gridDisposables);
      disposeSceneObjects(permanentFrameDisposables);

      // Traverse scene and dispose any remaining resources
      if (scene) {
        scene.traverse((obj) => {
          if (obj instanceof Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material?.dispose();
            }
          }
          if (obj instanceof Sprite) {
            (obj.material as SpriteMaterial)?.map?.dispose();
            obj.material?.dispose();
          }
        });
        scene.clear();
        scene = null;
      }

      frameGroup = null;
      worldGroup = null;

      // Dispose renderer and remove canvas
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
        renderer = null;
      }

      camera = null;
    },

    resize(w: number, h: number): void {
      if (destroyed || !renderer || !camera) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      needsRender = true;
    },
  };
}

// ── Label Overlay ─────────────────────────────────────────────────────

/**
 * Create an HTML overlay showing expression labels in the top-left corner
 * of a 3D graph container. Stays static during camera rotation.
 */
function createLabelOverlay(container: HTMLElement, spec: PlotSpec): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "kcl-graph-3d-labels";

  for (let i = 0; i < spec.data.length; i++) {
    const pd = spec.data[i];
    const color = COLORS[i % COLORS.length];
    const label = document.createElement("div");
    label.className = "kcl-graph-3d-label";
    label.style.color = color;
    // Clean up the LaTeX for display
    const text = pd.latex.replace(/@plot3d\s*$/i, "").trim();
    label.textContent = text;
    overlay.appendChild(label);
  }

  container.appendChild(overlay);
  return overlay;
}

// ── Snapshot Renderer ─────────────────────────────────────────────────

/**
 * Render a static snapshot of a 3D graph and return it as a data URL.
 * Creates a temp offscreen container, renders one frame via create3DGraph,
 * captures toDataURL(), then destroys everything. Context lives ~50ms.
 */
export function renderSnapshot(
  spec: PlotSpec,
  isDark: boolean,
  zoomMode: "origin" | "range-center" = "origin",
  showTicks = true,
): string {
  const temp = document.createElement("div");
  temp.style.cssText =
    "position:fixed;left:-10000px;top:-10000px;width:800px;height:400px;visibility:hidden;";
  document.body.appendChild(temp);

  try {
    const handle = create3DGraph(temp, spec, isDark, zoomMode, showTicks);
    const canvas = temp.querySelector("canvas");
    const dataUrl = canvas?.toDataURL("image/png") ?? "";
    handle.destroy();
    return dataUrl;
  } finally {
    document.body.removeChild(temp);
  }
}
