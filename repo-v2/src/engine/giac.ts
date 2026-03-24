/**
 * King's CalcLatex v2 — Giac WASM Bridge
 *
 * Lazy-loads the Giac computer algebra system via WASM in a Web Worker,
 * eliminating the main-thread freeze during initialization (19MB JS parse
 * + WASM compile). The worker receives the giacwasm.js source from the
 * main thread (which reads it via fs.readFileSync), sets up the Emscripten
 * Module, and exposes caseval via postMessage.
 *
 * Setup: place `giacwasm.js` in the Obsidian plugin folder
 * (.obsidian/plugins/kings-calclatex/giacwasm.js).
 *
 * All CAS functions (giacDifferentiate, giacIntegrate, etc.) are now async
 * and return Promise<Result<EvalResult> | null>. They resolve to null
 * immediately when Giac is not ready.
 */

import { parseLatex, getCE, jsonToLatex } from "./parser";
import { latexToReadable } from "./cas";
import type { EvalResult, Result, Diagnostic } from "../types";
import { ok, err } from "../types";

// ══════════════════════════════════════════════════════════════
//  WEB WORKER SOURCE (inlined as Blob URL)
// ══════════════════════════════════════════════════════════════

/**
 * The Worker script as a string. It will be turned into a Blob URL so no
 * separate file or bundler entry point is needed.
 *
 * Protocol:
 *   Main → Worker:  { type: 'init', code: string }
 *                   { type: 'eval', id: number, expr: string }
 *                   { type: 'eval_steps', id: number, expr: string }
 *   Worker → Main:  { type: 'ready' }
 *                   { type: 'error', message: string }
 *                   { type: 'result', id: number, value: string | null, steps?: string[] }
 */
const WORKER_SOURCE = `
var caseval = null;

self.onmessage = function(e) {
  var data = e.data;

  if (data.type === 'init') {
    // Set up Emscripten Module BEFORE executing the script.
    // Workers use self instead of window.
    self.Module = {
      print:    function() {},
      printErr: function() {},
      canvas:   null,
      setStatus: function() {},
      onRuntimeInitialized: function() {
        try {
          caseval = self.Module.cwrap('caseval', 'string', ['string']);
          self.postMessage({ type: 'ready' });
        } catch (err) {
          self.postMessage({ type: 'error', message: 'cwrap failed: ' + String(err) });
        }
      }
    };

    // ── Stub Emscripten GL bindings ──────────────────────────────────────
    // giacwasm.js is built with Emscripten's WebGL/OpenGL emulation layer.
    // That layer defines JS functions like _emscripten_glEnable,
    // _emscripten_glDisable, etc. and tries to bind them to a WebGL context
    // during module init. In a Web Worker there is no canvas / GL context, so
    // those bindings are undefined globals → ReferenceError on first call.
    //
    // Fix: before eval() we install no-op stubs for every GL function that
    // Emscripten will try to call. We use a Proxy on a plain object as the
    // prototype of self so that ANY _emscripten_gl* lookup auto-creates a
    // no-op. We also set the most common ones explicitly as a belt-and-
    // suspenders fallback for environments where the Proxy trick doesn't apply
    // to the global scope lookup chain.
    (function stubEmscriptenGL() {
      // Belt-and-suspenders: explicitly define the most common GL entry points
      // that Emscripten unconditionally calls during startup.
      var _glNoop = function() { return 0; };
      var glNames = [
        '_emscripten_glActiveTexture',
        '_emscripten_glAttachShader',
        '_emscripten_glBeginQuery',
        '_emscripten_glBeginTransformFeedback',
        '_emscripten_glBindAttribLocation',
        '_emscripten_glBindBuffer',
        '_emscripten_glBindBufferBase',
        '_emscripten_glBindBufferRange',
        '_emscripten_glBindFramebuffer',
        '_emscripten_glBindRenderbuffer',
        '_emscripten_glBindSampler',
        '_emscripten_glBindTexture',
        '_emscripten_glBindTransformFeedback',
        '_emscripten_glBindVertexArray',
        '_emscripten_glBlendColor',
        '_emscripten_glBlendEquation',
        '_emscripten_glBlendEquationSeparate',
        '_emscripten_glBlendFunc',
        '_emscripten_glBlendFuncSeparate',
        '_emscripten_glBlitFramebuffer',
        '_emscripten_glBufferData',
        '_emscripten_glBufferSubData',
        '_emscripten_glCheckFramebufferStatus',
        '_emscripten_glClear',
        '_emscripten_glClearBufferfi',
        '_emscripten_glClearBufferfv',
        '_emscripten_glClearBufferiv',
        '_emscripten_glClearBufferuiv',
        '_emscripten_glClearColor',
        '_emscripten_glClearDepthf',
        '_emscripten_glClearStencil',
        '_emscripten_glClientWaitSync',
        '_emscripten_glColorMask',
        '_emscripten_glCompileShader',
        '_emscripten_glCompressedTexImage2D',
        '_emscripten_glCompressedTexImage3D',
        '_emscripten_glCompressedTexSubImage2D',
        '_emscripten_glCompressedTexSubImage3D',
        '_emscripten_glCopyBufferSubData',
        '_emscripten_glCopyTexImage2D',
        '_emscripten_glCopyTexSubImage2D',
        '_emscripten_glCopyTexSubImage3D',
        '_emscripten_glCreateProgram',
        '_emscripten_glCreateShader',
        '_emscripten_glCullFace',
        '_emscripten_glDeleteBuffers',
        '_emscripten_glDeleteFramebuffers',
        '_emscripten_glDeleteProgram',
        '_emscripten_glDeleteQueries',
        '_emscripten_glDeleteRenderbuffers',
        '_emscripten_glDeleteSamplers',
        '_emscripten_glDeleteShader',
        '_emscripten_glDeleteSync',
        '_emscripten_glDeleteTextures',
        '_emscripten_glDeleteTransformFeedbacks',
        '_emscripten_glDeleteVertexArrays',
        '_emscripten_glDepthFunc',
        '_emscripten_glDepthMask',
        '_emscripten_glDepthRangef',
        '_emscripten_glDetachShader',
        '_emscripten_glDisable',
        '_emscripten_glDisableVertexAttribArray',
        '_emscripten_glDrawArrays',
        '_emscripten_glDrawArraysInstanced',
        '_emscripten_glDrawBuffers',
        '_emscripten_glDrawElements',
        '_emscripten_glDrawElementsInstanced',
        '_emscripten_glDrawRangeElements',
        '_emscripten_glEnable',
        '_emscripten_glEnableVertexAttribArray',
        '_emscripten_glEndQuery',
        '_emscripten_glEndTransformFeedback',
        '_emscripten_glFenceSync',
        '_emscripten_glFinish',
        '_emscripten_glFlush',
        '_emscripten_glFramebufferRenderbuffer',
        '_emscripten_glFramebufferTexture2D',
        '_emscripten_glFramebufferTextureLayer',
        '_emscripten_glFrontFace',
        '_emscripten_glGenBuffers',
        '_emscripten_glGenFramebuffers',
        '_emscripten_glGenQueries',
        '_emscripten_glGenRenderbuffers',
        '_emscripten_glGenSamplers',
        '_emscripten_glGenTextures',
        '_emscripten_glGenTransformFeedbacks',
        '_emscripten_glGenVertexArrays',
        '_emscripten_glGenerateMipmap',
        '_emscripten_glGetActiveAttrib',
        '_emscripten_glGetActiveUniform',
        '_emscripten_glGetActiveUniformBlockName',
        '_emscripten_glGetActiveUniformBlockiv',
        '_emscripten_glGetActiveUniformsiv',
        '_emscripten_glGetAttribLocation',
        '_emscripten_glGetBooleanv',
        '_emscripten_glGetBufferParameteriv',
        '_emscripten_glGetError',
        '_emscripten_glGetFloatv',
        '_emscripten_glGetFragDataLocation',
        '_emscripten_glGetFramebufferAttachmentParameteriv',
        '_emscripten_glGetIntegerv',
        '_emscripten_glGetInteger64i_v',
        '_emscripten_glGetInteger64v',
        '_emscripten_glGetIntegeri_v',
        '_emscripten_glGetInternalformativ',
        '_emscripten_glGetProgramBinary',
        '_emscripten_glGetProgramInfoLog',
        '_emscripten_glGetProgramiv',
        '_emscripten_glGetQueryObjectuiv',
        '_emscripten_glGetQueryiv',
        '_emscripten_glGetRenderbufferParameteriv',
        '_emscripten_glGetSamplerParameterfv',
        '_emscripten_glGetSamplerParameteriv',
        '_emscripten_glGetShaderInfoLog',
        '_emscripten_glGetShaderPrecisionFormat',
        '_emscripten_glGetShaderSource',
        '_emscripten_glGetShaderiv',
        '_emscripten_glGetString',
        '_emscripten_glGetStringi',
        '_emscripten_glGetSynciv',
        '_emscripten_glGetTexParameterfv',
        '_emscripten_glGetTexParameteriv',
        '_emscripten_glGetTransformFeedbackVarying',
        '_emscripten_glGetUniformBlockIndex',
        '_emscripten_glGetUniformIndices',
        '_emscripten_glGetUniformLocation',
        '_emscripten_glGetUniformfv',
        '_emscripten_glGetUniformiv',
        '_emscripten_glGetUniformuiv',
        '_emscripten_glGetVertexAttribIiv',
        '_emscripten_glGetVertexAttribIuiv',
        '_emscripten_glGetVertexAttribPointerv',
        '_emscripten_glGetVertexAttribfv',
        '_emscripten_glGetVertexAttribiv',
        '_emscripten_glHint',
        '_emscripten_glInvalidateFramebuffer',
        '_emscripten_glInvalidateSubFramebuffer',
        '_emscripten_glIsEnabled',
        '_emscripten_glIsFramebuffer',
        '_emscripten_glIsProgram',
        '_emscripten_glIsQuery',
        '_emscripten_glIsRenderbuffer',
        '_emscripten_glIsSampler',
        '_emscripten_glIsShader',
        '_emscripten_glIsSync',
        '_emscripten_glIsTexture',
        '_emscripten_glIsTransformFeedback',
        '_emscripten_glIsVertexArray',
        '_emscripten_glLineWidth',
        '_emscripten_glLinkProgram',
        '_emscripten_glPauseTransformFeedback',
        '_emscripten_glPixelStorei',
        '_emscripten_glPolygonOffset',
        '_emscripten_glProgramBinary',
        '_emscripten_glProgramParameteri',
        '_emscripten_glReadBuffer',
        '_emscripten_glReadPixels',
        '_emscripten_glRenderbufferStorage',
        '_emscripten_glRenderbufferStorageMultisample',
        '_emscripten_glResumeTransformFeedback',
        '_emscripten_glSampleCoverage',
        '_emscripten_glSamplerParameterf',
        '_emscripten_glSamplerParameterfv',
        '_emscripten_glSamplerParameteri',
        '_emscripten_glSamplerParameteriv',
        '_emscripten_glScissor',
        '_emscripten_glShaderSource',
        '_emscripten_glStencilFunc',
        '_emscripten_glStencilFuncSeparate',
        '_emscripten_glStencilMask',
        '_emscripten_glStencilMaskSeparate',
        '_emscripten_glStencilOp',
        '_emscripten_glStencilOpSeparate',
        '_emscripten_glTexImage2D',
        '_emscripten_glTexImage3D',
        '_emscripten_glTexParameterf',
        '_emscripten_glTexParameterfv',
        '_emscripten_glTexParameteri',
        '_emscripten_glTexParameteriv',
        '_emscripten_glTexStorage2D',
        '_emscripten_glTexStorage3D',
        '_emscripten_glTexSubImage2D',
        '_emscripten_glTexSubImage3D',
        '_emscripten_glTransformFeedbackVaryings',
        '_emscripten_glUniform1f',
        '_emscripten_glUniform1fv',
        '_emscripten_glUniform1i',
        '_emscripten_glUniform1iv',
        '_emscripten_glUniform1ui',
        '_emscripten_glUniform1uiv',
        '_emscripten_glUniform2f',
        '_emscripten_glUniform2fv',
        '_emscripten_glUniform2i',
        '_emscripten_glUniform2iv',
        '_emscripten_glUniform2ui',
        '_emscripten_glUniform2uiv',
        '_emscripten_glUniform3f',
        '_emscripten_glUniform3fv',
        '_emscripten_glUniform3i',
        '_emscripten_glUniform3iv',
        '_emscripten_glUniform3ui',
        '_emscripten_glUniform3uiv',
        '_emscripten_glUniform4f',
        '_emscripten_glUniform4fv',
        '_emscripten_glUniform4i',
        '_emscripten_glUniform4iv',
        '_emscripten_glUniform4ui',
        '_emscripten_glUniform4uiv',
        '_emscripten_glUniformBlockBinding',
        '_emscripten_glUniformMatrix2fv',
        '_emscripten_glUniformMatrix2x3fv',
        '_emscripten_glUniformMatrix2x4fv',
        '_emscripten_glUniformMatrix3fv',
        '_emscripten_glUniformMatrix3x2fv',
        '_emscripten_glUniformMatrix3x4fv',
        '_emscripten_glUniformMatrix4fv',
        '_emscripten_glUniformMatrix4x2fv',
        '_emscripten_glUniformMatrix4x3fv',
        '_emscripten_glUseProgram',
        '_emscripten_glValidateProgram',
        '_emscripten_glVertexAttrib1f',
        '_emscripten_glVertexAttrib1fv',
        '_emscripten_glVertexAttrib2f',
        '_emscripten_glVertexAttrib2fv',
        '_emscripten_glVertexAttrib3f',
        '_emscripten_glVertexAttrib3fv',
        '_emscripten_glVertexAttrib4f',
        '_emscripten_glVertexAttrib4fv',
        '_emscripten_glVertexAttribDivisor',
        '_emscripten_glVertexAttribI4i',
        '_emscripten_glVertexAttribI4iv',
        '_emscripten_glVertexAttribI4ui',
        '_emscripten_glVertexAttribI4uiv',
        '_emscripten_glVertexAttribIPointer',
        '_emscripten_glVertexAttribPointer',
        '_emscripten_glViewport',
        '_emscripten_glWaitSync',
        // Emscripten also calls these canvas/context helpers in the GL layer
        '_emscripten_set_canvas_element_size',
        '_emscripten_get_canvas_element_size',
        '_emscripten_webgl_enable_extension',
        '_emscripten_webgl_do_create_context',
        '_emscripten_webgl_create_context',
        '_emscripten_webgl_destroy_context',
        '_emscripten_webgl_make_context_current',
        '_emscripten_webgl_get_current_context',
      ];
      for (var i = 0; i < glNames.length; i++) {
        if (typeof self[glNames[i]] === 'undefined') {
          self[glNames[i]] = _glNoop;
        }
      }

      // Dynamic catch-all: wrap self in a Proxy so any _emscripten_gl* name
      // that we missed above also returns the no-op rather than throwing.
      // (Not all Worker environments support Proxy on the global scope, so
      // the explicit list above is the primary mechanism; this is a fallback.)
      try {
        var _selfProxy = new Proxy(self, {
          get: function(target, prop) {
            if (typeof prop === 'string' && prop.startsWith('_emscripten_gl')) {
              return target[prop] !== undefined ? target[prop] : _glNoop;
            }
            return target[prop];
          }
        });
        // Replace the implicit global lookup target used by eval'd code.
        // In most Worker environments eval uses the real global (self), not
        // a Proxy, so this may not take effect — but it costs nothing to try.
        if (typeof globalThis !== 'undefined' && globalThis !== self) {
          // Different object — can't reassign; skip silently.
        }
      } catch(e) {
        // Proxy on self is not supported in this environment; that's fine —
        // the explicit stub list above covers all known GL entry points.
      }
    })();

    try {
      // Indirect eval (0, eval)() forces execution in the GLOBAL scope,
      // not the local scope of onmessage. This is critical because
      // Emscripten's generated code expects var/function declarations
      // to be global and references GL/WASM bindings by global name.
      // Direct eval in a function scope would scope declarations locally,
      // breaking cross-reference resolution in giacwasm.js.
      (0, eval)(data.code);
    } catch (err) {
      self.postMessage({ type: 'error', message: 'eval failed: ' + String(err) });
    }
    return;
  }

  if (data.type === 'eval') {
    if (!caseval) {
      self.postMessage({ type: 'result', id: data.id, value: null });
      return;
    }
    try {
      var result = caseval(data.expr);
      self.postMessage({
        type: 'result',
        id: data.id,
        value: (result && !result.startsWith('GIAC_ERROR')) ? result : null
      });
    } catch (err) {
      self.postMessage({ type: 'result', id: data.id, value: null });
    }
    return;
  }

  if (data.type === 'eval_steps') {
    if (!caseval) {
      self.postMessage({ type: 'result', id: data.id, value: null, steps: [] });
      return;
    }
    var steps = [];
    var origPrint = self.Module.print || function() {};
    try {
      self.Module.print = function(msg) {
        if (typeof msg === 'string' && msg.trim().length > 0) {
          steps.push(msg);
        }
      };
      try { caseval('debug_infolevel(1)'); } catch(e2) {}
      var result = caseval(data.expr);
      try { caseval('debug_infolevel(0)'); } catch(e2) {}
      self.Module.print = origPrint;
      self.postMessage({
        type: 'result',
        id: data.id,
        value: (result && !result.startsWith('GIAC_ERROR')) ? result : null,
        steps: steps
      });
    } catch (err) {
      self.Module.print = origPrint;
      try { caseval('debug_infolevel(0)'); } catch(e2) {}
      self.postMessage({ type: 'result', id: data.id, value: null, steps: [] });
    }
    return;
  }
};
`;

// ══════════════════════════════════════════════════════════════
//  GIAC RUNTIME STATE
// ══════════════════════════════════════════════════════════════

let giacReady = false;
let loadPromise: Promise<boolean> | null = null;
let worker: Worker | null = null;

/** Result from the Worker, optionally including step-by-step output. */
interface WorkerResult {
  value: string | null;
  steps: string[];
}

/** Pending eval requests keyed by a monotonically-increasing ID. */
const pendingRequests = new Map<number, { resolve: (v: WorkerResult) => void; reject: (e: any) => void }>();
let nextRequestId = 0;

/** Check if Giac is loaded and ready (synchronous — just reads a flag). */
export function isGiacReady(): boolean {
  return giacReady;
}

/**
 * Initialize Giac WASM by loading giacwasm.js from the plugin folder into a
 * Web Worker. Returns true if Giac loaded successfully, false otherwise.
 * Safe to call multiple times — only loads once.
 *
 * Loading strategy:
 *   1. Main thread reads giacwasm.js via Node fs (async, non-blocking).
 *   2. Worker is created from an inline Blob URL (no separate file needed).
 *   3. Main thread sends the file content to the worker via postMessage.
 *   4. Worker sets up self.Module and eval()s the code.
 *   5. Emscripten calls onRuntimeInitialized → worker sends { type: 'ready' }.
 *
 * This means the 19MB JS parse + WASM compile happen entirely off the main
 * thread, preventing any UI freeze.
 *
 * Fallback: if Worker creation fails (e.g. sandboxed environment), the
 * function resolves false without crashing.
 */
export function initGiac(pluginDir: string): Promise<boolean> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    try {
      const giacPath = pluginDir.replace(/\\/g, "/") + "/giacwasm.js";

      // Check fs availability (Electron exposes require)
      let fs: any;
      try {
        fs = (window as any).require("fs");
        if (!fs.existsSync(giacPath)) {
          console.log("KCL: giacwasm.js not found at", giacPath);
          resolve(false);
          return;
        }
      } catch {
        console.log("KCL: Cannot check for giacwasm.js (no fs access)");
        resolve(false);
        return;
      }

      // Timeout: WASM compilation can be slow on first load
      const timeout = setTimeout(() => {
        if (!giacReady) {
          console.warn("KCL: Giac Worker initialization timed out (90s)");
          resolve(false);
        }
      }, 90000);

      // Create the Worker from a Blob URL — no separate file needed
      let newWorker: Worker;
      try {
        const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
        const workerUrl = URL.createObjectURL(blob);
        newWorker = new Worker(workerUrl);
        // The URL can be revoked immediately after Worker construction
        URL.revokeObjectURL(workerUrl);
      } catch (workerErr) {
        // Worker creation failed — fall back to old inline-script approach
        console.warn("KCL: Web Worker creation failed, falling back to inline script:", workerErr);
        clearTimeout(timeout);
        resolve(_fallbackInlineLoad(giacPath, fs));
        return;
      }

      worker = newWorker;

      // Set up main-thread message handler
      worker.onmessage = (e) => {
        const data = e.data;

        if (data.type === "ready") {
          clearTimeout(timeout);
          giacReady = true;
          console.log("KCL: Giac WASM initialized in Worker successfully");
          resolve(true);
          return;
        }

        if (data.type === "error") {
          console.error("KCL: Giac Worker error:", data.message);
          clearTimeout(timeout);
          // Drain pending requests
          for (const [id, { resolve: res }] of pendingRequests) {
            res({ value: null, steps: [] });
            pendingRequests.delete(id);
          }
          resolve(false);
          return;
        }

        if (data.type === "result") {
          const pending = pendingRequests.get(data.id);
          if (pending) {
            pending.resolve({ value: data.value, steps: data.steps || [] });
            pendingRequests.delete(data.id);
          }
          return;
        }
      };

      worker.onerror = (e) => {
        console.error("KCL: Giac Worker runtime error:", e.message);
        clearTimeout(timeout);
        for (const [id, { resolve: res }] of pendingRequests) {
          res(null);
          pendingRequests.delete(id);
        }
        if (!giacReady) resolve(false);
      };

      // Read the file asynchronously (non-blocking) then send to worker
      console.log("KCL: Reading giacwasm.js for Worker…", giacPath);
      fs.readFile(giacPath, "utf8", (readErr: any, code: string) => {
        if (readErr) {
          console.error("KCL: Failed to read giacwasm.js:", readErr);
          clearTimeout(timeout);
          resolve(false);
          return;
        }
        console.log("KCL: Sending giacwasm.js to Worker (", Math.round(code.length / 1024), "KB)…");
        worker!.postMessage({ type: "init", code });
      });

    } catch (e) {
      console.error("KCL: Giac initialization error:", e);
      resolve(false);
    }
  });

  return loadPromise;
}

/**
 * Fallback: load Giac on the main thread via inline <script> injection.
 * Used when Web Worker creation fails.
 */
function _fallbackInlineLoad(giacPath: string, fs: any): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const oldModule = (window as any).Module;
      const timeout = setTimeout(() => {
        if (!giacReady) {
          console.warn("KCL: Giac inline fallback timed out (60s)");
          resolve(false);
        }
      }, 60000);

      (window as any).Module = {
        ready: false,
        worker: false,
        print: () => {},
        printErr: () => {},
        canvas: null,
        setStatus: () => {},
        onRuntimeInitialized: () => {
          clearTimeout(timeout);
          try {
            // In fallback mode, wrap caseval to work with our async interface
            const rawCaseval = (window as any).Module.cwrap("caseval", "string", ["string"]);
            // Monkey-patch the worker.postMessage path to use the inline caseval
            _inlineCaseval = rawCaseval;
            giacReady = true;
            console.log("KCL: Giac WASM initialized via inline fallback");
            resolve(true);
          } catch (e) {
            console.error("KCL: Giac cwrap failed (inline fallback):", e);
            if (oldModule) (window as any).Module = oldModule;
            resolve(false);
          }
        },
      };

      console.log("KCL: Loading giacwasm.js via inline script (fallback)…");
      const code = fs.readFileSync(giacPath, "utf8");
      const script = document.createElement("script");
      script.textContent = code;
      document.head.appendChild(script);
      document.head.removeChild(script);
      console.log("KCL: giacwasm.js executed (inline fallback), waiting for WASM init…");
    } catch (e) {
      console.error("KCL: Giac inline fallback error:", e);
      resolve(false);
    }
  });
}

/**
 * In fallback (inline) mode, this holds the raw caseval function.
 * It is used by _workerEval to directly call caseval synchronously,
 * while still preserving the async Promise interface.
 */
let _inlineCaseval: ((s: string) => string) | null = null;

// ══════════════════════════════════════════════════════════════
//  RAW GIAC EVAL (async)
// ══════════════════════════════════════════════════════════════

/**
 * Send an expression to the Giac Worker and await the result.
 * Returns null if Giac is not ready, the Worker is absent, or eval fails.
 */
function workerEval(expr: string): Promise<string | null> {
  if (!giacReady) return Promise.resolve(null);

  // Inline fallback path: call caseval synchronously, wrap in Promise
  if (!worker && _inlineCaseval) {
    try {
      const result = _inlineCaseval(expr);
      if (!result || result.startsWith("GIAC_ERROR")) return Promise.resolve(null);
      return Promise.resolve(result);
    } catch {
      return Promise.resolve(null);
    }
  }

  if (!worker) return Promise.resolve(null);

  return new Promise<string | null>((resolve, reject) => {
    const id = nextRequestId++;
    pendingRequests.set(id, {
      resolve: (r) => resolve(r.value),
      reject,
    });
    worker!.postMessage({ type: "eval", id, expr });
  });
}

/**
 * Send an expression to the Worker with debug_infolevel=1 to capture
 * step-by-step output from Giac's Module.print side channel.
 */
function workerEvalWithSteps(expr: string): Promise<WorkerResult> {
  const empty: WorkerResult = { value: null, steps: [] };
  if (!giacReady) return Promise.resolve(empty);

  // Inline fallback path: intercept window.Module.print
  if (!worker && _inlineCaseval) {
    return _inlineEvalWithSteps(expr);
  }

  if (!worker) return Promise.resolve(empty);

  return new Promise<WorkerResult>((resolve, reject) => {
    const id = nextRequestId++;
    pendingRequests.set(id, { resolve, reject });
    worker!.postMessage({ type: "eval_steps", id, expr });
  });
}

/**
 * Inline fallback for step capture: temporarily intercept window.Module.print.
 */
function _inlineEvalWithSteps(expr: string): Promise<WorkerResult> {
  const empty: WorkerResult = { value: null, steps: [] };
  try {
    const steps: string[] = [];
    const mod = (window as any).Module;
    const origPrint = mod?.print;
    if (mod) {
      mod.print = (msg: string) => {
        if (typeof msg === "string" && msg.trim()) steps.push(msg);
      };
    }
    try {
      _inlineCaseval!("debug_infolevel(1)");
      const result = _inlineCaseval!(expr);
      _inlineCaseval!("debug_infolevel(0)");
      if (mod) mod.print = origPrint || (() => {});
      const value = (result && !result.startsWith("GIAC_ERROR")) ? result : null;
      return Promise.resolve({ value, steps });
    } catch {
      if (mod) mod.print = origPrint || (() => {});
      try { _inlineCaseval!("debug_infolevel(0)"); } catch { /* ignore */ }
      return Promise.resolve(empty);
    }
  } catch {
    return Promise.resolve(empty);
  }
}

/**
 * Evaluate a raw Giac expression string asynchronously.
 * Returns null if Giac is not ready or the expression fails.
 */
async function giacRawEval(expr: string): Promise<string | null> {
  if (!giacReady) return null;
  try {
    return await workerEval(expr);
  } catch {
    return null;
  }
}

/**
 * Evaluate a Giac expression and return LaTeX asynchronously.
 * Wraps the expression in latex() for LaTeX output.
 */
async function giacLatex(expr: string): Promise<string | null> {
  return giacRawEval(`latex(${expr})`);
}

// ══════════════════════════════════════════════════════════════
//  MathJSON → GIAC SYNTAX CONVERSION
// ══════════════════════════════════════════════════════════════

/**
 * Convert a MathJSON node to Giac-compatible syntax string.
 * Giac uses standard math notation: x^3, sin(x), pi, e, etc.
 */
export function jsonToGiac(node: unknown): string {
  if (typeof node === "number") return node.toString();

  if (typeof node === "string") {
    switch (node) {
      case "Pi": return "pi";
      case "ExponentialE": case "E": return "e";
      case "ImaginaryUnit": return "i";
      case "Infinity": case "PositiveInfinity": return "inf";
      case "NegativeInfinity": return "-inf";
      case "Nothing": return "undef";
      default: return node;
    }
  }

  if (typeof node === "object" && node !== null && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    if ("num" in obj && typeof obj.num === "string") return obj.num;
    return String(node);
  }

  if (!Array.isArray(node)) return String(node);

  const [head, ...args] = node as [string, ...unknown[]];

  switch (head) {
    case "Add": return "(" + args.map(jsonToGiac).join("+") + ")";
    case "Subtract":
      if (args.length === 2) return "(" + jsonToGiac(args[0]) + "-(" + jsonToGiac(args[1]) + "))";
      return "(-" + jsonToGiac(args[0]) + ")";
    case "Negate": return "(-(" + jsonToGiac(args[0]) + "))";
    case "Multiply": return "(" + args.map(jsonToGiac).join("*") + ")";
    case "Divide":
      if (args.length === 2) return "((" + jsonToGiac(args[0]) + ")/(" + jsonToGiac(args[1]) + "))";
      return args.map(jsonToGiac).join("/");
    case "Power":
      if (args.length === 2) {
        // e^x → exp(x) so Giac treats it symbolically (not as (e)^(x))
        if (args[0] === "ExponentialE" || args[0] === "E")
          return "exp(" + jsonToGiac(args[1]) + ")";
        return "((" + jsonToGiac(args[0]) + ")^(" + jsonToGiac(args[1]) + "))";
      }
      return String(node);
    case "Square": return "((" + jsonToGiac(args[0]) + ")^2)";
    case "Cube": return "((" + jsonToGiac(args[0]) + ")^3)";
    case "Sqrt": return "sqrt(" + jsonToGiac(args[0]) + ")";
    case "Root":
      if (args.length === 2) return "surd(" + jsonToGiac(args[0]) + "," + jsonToGiac(args[1]) + ")";
      return String(node);
    case "Rational":
      if (args.length === 2) return "((" + jsonToGiac(args[0]) + ")/(" + jsonToGiac(args[1]) + "))";
      return String(node);

    // Trig
    case "Sin": return "sin(" + jsonToGiac(args[0]) + ")";
    case "Cos": return "cos(" + jsonToGiac(args[0]) + ")";
    case "Tan": return "tan(" + jsonToGiac(args[0]) + ")";
    case "Cot": return "cot(" + jsonToGiac(args[0]) + ")";
    case "Sec": return "1/cos(" + jsonToGiac(args[0]) + ")";
    case "Csc": return "1/sin(" + jsonToGiac(args[0]) + ")";
    case "Arcsin": return "asin(" + jsonToGiac(args[0]) + ")";
    case "Arccos": return "acos(" + jsonToGiac(args[0]) + ")";
    case "Arctan": case "ArcTan": return "atan(" + jsonToGiac(args[0]) + ")";
    case "Sinh": return "sinh(" + jsonToGiac(args[0]) + ")";
    case "Cosh": return "cosh(" + jsonToGiac(args[0]) + ")";
    case "Tanh": return "tanh(" + jsonToGiac(args[0]) + ")";

    // Exp / Log
    case "Exp": return "exp(" + jsonToGiac(args[0]) + ")";
    case "Ln": return "ln(" + jsonToGiac(args[0]) + ")";
    case "Log":
      if (args.length === 1) return "log(" + jsonToGiac(args[0]) + ")";
      if (args.length === 2) return "log(" + jsonToGiac(args[0]) + ")/log(" + jsonToGiac(args[1]) + ")";
      return String(node);
    case "Log2": return "log((" + jsonToGiac(args[0]) + "))/log(2)";

    // Misc
    case "Abs": return "abs(" + jsonToGiac(args[0]) + ")";
    case "Floor": return "floor(" + jsonToGiac(args[0]) + ")";
    case "Ceiling": return "ceil(" + jsonToGiac(args[0]) + ")";
    case "Half": return "((" + jsonToGiac(args[0]) + ")/2)";

    // Containers
    case "Sequence": case "List": return args.map(jsonToGiac).join(",");
    case "Delimiter": return args.length >= 1 ? jsonToGiac(args[0]) : "";

    // Relations
    case "Equal": case "Assign": case "Equation":
      if (args.length === 2) return jsonToGiac(args[0]) + "=" + jsonToGiac(args[1]);
      return args.map(jsonToGiac).join("=");

    default:
      // Try lowercase function name
      if (args.length > 0)
        return head.toLowerCase() + "(" + args.map(jsonToGiac).join(",") + ")";
      return head;
  }
}

/**
 * Convert LaTeX to Giac syntax via CortexJS MathJSON intermediate.
 */
export function latexToGiac(latex: string): string {
  try {
    const expr = parseLatex(latex);
    return jsonToGiac(expr.json);
  } catch {
    // Fallback: basic string-level conversion
    return latex
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))")
      .replace(/\\sin/g, "sin").replace(/\\cos/g, "cos").replace(/\\tan/g, "tan")
      .replace(/\\ln/g, "ln").replace(/\\log/g, "log").replace(/\\exp/g, "exp")
      .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
      .replace(/\\pi/g, "pi")
      .replace(/\\left/g, "").replace(/\\right/g, "")
      .replace(/\{/g, "(").replace(/\}/g, ")")
      .replace(/\\cdot/g, "*")
      .replace(/\\,/g, "").replace(/\\ /g, " ");
  }
}

// ══════════════════════════════════════════════════════════════
//  VARIABLE DETECTION
// ══════════════════════════════════════════════════════════════

function resolveVariable(latex: string, variable?: string): string {
  if (variable) return variable;
  try {
    const expr = parseLatex(latex);
    const freeVars = expr.freeVariables;
    if (freeVars && freeVars.length > 0) {
      if (freeVars.includes("x")) return "x";
      if (freeVars.includes("t")) return "t";
      if (freeVars.includes("y")) return "y";
      return freeVars[0];
    }
  } catch { /* fall through */ }
  return "x";
}

// ══════════════════════════════════════════════════════════════
//  HIGH-LEVEL CAS OPERATIONS (async, Giac-powered)
// ══════════════════════════════════════════════════════════════

async function makeResult(giacLatexResult: string, diagnostics: Diagnostic[]): Promise<Result<EvalResult>> {
  // Giac's latex() output may have surrounding quotes or $ — strip them
  let latex = giacLatexResult.trim();
  if (latex.startsWith('"') && latex.endsWith('"')) latex = latex.slice(1, -1);
  if (latex.startsWith("$") && latex.endsWith("$")) latex = latex.slice(1, -1);
  // Clean up Giac-specific LaTeX oddities
  latex = latex
    .replace(/\\mathit\{([^{}]+)\}/g, "$1")
    .replace(/\\mathrm\{([^{}]+)\}/g, "\\operatorname{$1}");

  const text = latexToReadable(latex);
  return ok({ latex, text }, diagnostics);
}

/** Differentiate using Giac. Returns null if Giac unavailable. */
export async function giacDifferentiate(latex: string, variable?: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;
  const v = resolveVariable(latex, variable);
  const giacExpr = latexToGiac(latex);
  const result = await giacLatex(`diff(${giacExpr},${v})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Differentiated w.r.t. ${v} (Giac)` }]);
}

/**
 * Try to extract definite integral bounds and integrand from a LaTeX string.
 * Handles: \int_{lo}^{hi} expr and \int_lo^hi expr (no braces for single chars).
 * Returns { lo, hi, integrand } or null.
 */
function parseDefiniteIntegral(
  latex: string,
): { lo: string; hi: string; integrand: string } | null {
  // Pattern with braces: \int_{...}^{...} rest
  let m = latex.match(/\\int\s*_\{([^{}]+)\}\s*\^\{([^{}]+)\}\s*([\s\S]*)/);
  if (m) return { lo: m[1].trim(), hi: m[2].trim(), integrand: m[3].trim() };

  // Pattern without braces (single tokens): \int_a^b rest
  m = latex.match(/\\int\s*_([^\\{}\s])\s*\^([^\\{}\s])\s*([\s\S]*)/);
  if (m) return { lo: m[1].trim(), hi: m[2].trim(), integrand: m[3].trim() };

  return null;
}

/** Integrate using Giac. Supports definite integrals via \int_{a}^{b} notation. */
export async function giacIntegrate(latex: string, variable?: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;

  // Check for definite integral notation
  const defInt = parseDefiniteIntegral(latex);
  if (defInt) {
    // Strip trailing \, dx / \, dt etc. from integrand
    let integrand = defInt.integrand
      .replace(/\\,\s*d[a-zA-Z]$/, "")
      .replace(/\bd[a-zA-Z]$/, "")
      .trim();

    const v = resolveVariable(integrand, variable);
    const giacExpr = latexToGiac(integrand);
    const loGiac = latexToGiac(defInt.lo);
    const hiGiac = latexToGiac(defInt.hi);

    const result = await giacLatex(`integrate(${giacExpr},${v},${loGiac},${hiGiac})`);
    if (!result) return null;
    return makeResult(result, [{
      level: "info",
      message: `Definite integral from ${defInt.lo} to ${defInt.hi} w.r.t. ${v} (Giac)`,
    }]);
  }

  const v = resolveVariable(latex, variable);
  const giacExpr = latexToGiac(latex);
  const result = await giacLatex(`integrate(${giacExpr},${v})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Integrated w.r.t. ${v} (Giac)` }]);
}

/** Solve an equation or system of equations using Giac.
 *
 * Single equation:   `2x + 1 = 5`
 * System (semicolon-separated):  `x + y = 3; x - y = 1`
 */
export async function giacSolve(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;

  // Split on semicolons to detect a system of equations
  const parts = latex.split(";").map(p => p.trim()).filter(p => p.length > 0);

  if (parts.length > 1) {
    // System of equations — collect all equations and free variables
    const giacEqs: string[] = parts.map(p => {
      const g = latexToGiac(p);
      return g.includes("=") ? g : `${g}=0`;
    });

    // Collect free variables across all equations (prefer x, y, z ordering)
    const allVars = new Set<string>();
    for (const p of parts) {
      try {
        const expr = parseLatex(p);
        const fv = expr.freeVariables || [];
        for (const v of fv) allVars.add(v);
      } catch { /* ignore */ }
    }

    const orderedVars: string[] = [];
    for (const preferred of ["x", "y", "z", "t", "u", "v", "w"]) {
      if (allVars.has(preferred)) orderedVars.push(preferred);
    }
    for (const v of allVars) {
      if (!orderedVars.includes(v)) orderedVars.push(v);
    }

    const eqList = `[${giacEqs.join(",")}]`;
    const varList = `[${orderedVars.join(",")}]`;
    const result = await giacLatex(`solve(${eqList},${varList})`);
    if (!result) return null;
    return makeResult(result, [{
      level: "info",
      message: `Solved system of ${parts.length} equations for (${orderedVars.join(", ")}) (Giac)`,
    }]);
  }

  // Single equation
  const giacExpr = latexToGiac(latex);
  const v = resolveVariable(latex);

  const solveExpr = giacExpr.includes("=") ? giacExpr : `${giacExpr}=0`;
  const result = await giacLatex(`solve(${solveExpr},${v})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Solved for ${v} (Giac)` }]);
}

/** Factor using Giac. */
export async function giacFactor(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  const result = await giacLatex(`factor(${giacExpr})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: "Factored (Giac)" }]);
}

/** Simplify using Giac. */
export async function giacSimplify(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  const result = await giacLatex(`simplify(${giacExpr})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: "Simplified (Giac)" }]);
}

/** Expand using Giac. */
export async function giacExpand(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  const result = await giacLatex(`expand(${giacExpr})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: "Expanded (Giac)" }]);
}

/**
 * Parse a LaTeX "limit target" string like `x \to \infty`, `x \to 0^+`, `t \to 3`.
 * Returns { variable, target, direction } or null if not parseable.
 */
function parseLimitTarget(
  raw: string,
): { variable: string; target: string; direction: number } | null {
  // Normalise arrow variants: \to, \rightarrow, \longrightarrow, →
  const norm = raw.replace(/\\longrightarrow|\\rightarrow|→/g, "\\to").trim();
  // Match: <var> \to <target>   (var is one or more LaTeX token chars)
  const m = norm.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*\\to\s*(.+)$/);
  if (!m) return null;

  const variable = m[1];
  let targetRaw = m[2].trim();
  let direction = 0; // 0 = two-sided, 1 = right (0^+), -1 = left (0^-)

  // One-sided: 0^+ or 0^-
  if (targetRaw.endsWith("^+") || targetRaw.endsWith("^{+}")) {
    direction = 1;
    targetRaw = targetRaw.replace(/\^(\{?\+\}?)$/, "").trim();
  } else if (targetRaw.endsWith("^-") || targetRaw.endsWith("^{-}")) {
    direction = -1;
    targetRaw = targetRaw.replace(/\^(\{?\-\}?)$/, "").trim();
  }

  // Convert LaTeX target to Giac value
  let target: string;
  if (/^\\infty$/.test(targetRaw) || /^\+\\infty$/.test(targetRaw)) {
    target = "inf";
  } else if (/^-\\infty$/.test(targetRaw)) {
    target = "-inf";
  } else {
    // Attempt to convert via latexToGiac; fall back to raw numeric string
    try {
      target = latexToGiac(targetRaw);
    } catch {
      target = targetRaw;
    }
  }

  return { variable, target, direction };
}

/** Compute limit using Giac. Supports semicolon-separated parameter syntax. */
export async function giacLimit(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;

  // Split on semicolons: first part is expression, optional second is "x \to a"
  const parts = latex.split(";").map(p => p.trim());
  const exprLatex = parts[0];

  let variable = resolveVariable(exprLatex);
  let target = "0";
  let direction = 0;

  if (parts.length >= 2) {
    const parsed = parseLimitTarget(parts[1]);
    if (parsed) {
      variable = parsed.variable;
      target = parsed.target;
      direction = parsed.direction;
    }
  }

  const giacExpr = latexToGiac(exprLatex);
  const limitCall = direction !== 0
    ? `limit(${giacExpr},${variable},${target},${direction})`
    : `limit(${giacExpr},${variable},${target})`;

  const result = await giacLatex(limitCall);
  if (!result) return null;

  const arrowStr = direction === 1 ? `${variable}→${target}⁺` :
    direction === -1 ? `${variable}→${target}⁻` :
    `${variable}→${target}`;
  return makeResult(result, [{ level: "info", message: `Limit as ${arrowStr} (Giac)` }]);
}

/** Taylor series using Giac. Supports semicolon-separated parameter syntax.
 *
 * Formats:
 *   expr                   → order 5 around 0
 *   expr; n                → order n around 0  (bare integer)
 *   expr; x = a            → order 5 around a
 *   expr; x = a; n         → order n around a
 */
export async function giacTaylor(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;

  const parts = latex.split(";").map(p => p.trim());
  const exprLatex = parts[0];
  const v = resolveVariable(exprLatex);

  let center = "0";
  let order = 5;

  if (parts.length >= 2) {
    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i].trim();
      // "x = a" or "x=a" pattern — center point
      const centerMatch = seg.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
      if (centerMatch) {
        // variable from center match; convert value to Giac
        try {
          center = latexToGiac(centerMatch[2].trim());
        } catch {
          center = centerMatch[2].trim();
        }
        continue;
      }
      // Bare integer — order
      if (/^\d+$/.test(seg)) {
        order = parseInt(seg, 10);
        continue;
      }
    }
  }

  const giacExpr = latexToGiac(exprLatex);
  const result = await giacLatex(`taylor(${giacExpr},${v}=${center},${order})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Taylor series in ${v} around ${center}, order ${order} (Giac)` }]);
}

/** Partial fraction decomposition using Giac. */
export async function giacPartfrac(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;
  const v = resolveVariable(latex);
  const giacExpr = latexToGiac(latex);
  const result = await giacLatex(`partfrac(${giacExpr},${v})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Partial fractions in ${v} (Giac)` }]);
}

/** Partial derivative using Giac. */
export async function giacPartialDerivative(latex: string, variable: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  const result = await giacLatex(`diff(${giacExpr},${variable})`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `∂/∂${variable} (Giac)` }]);
}

/** Gradient using Giac. */
export async function giacGradient(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);

  const expr = parseLatex(latex);
  const freeVars = expr.freeVariables || [];
  const vars: string[] = [];
  if (freeVars.includes("x")) vars.push("x");
  if (freeVars.includes("y")) vars.push("y");
  if (freeVars.includes("z")) vars.push("z");
  if (vars.length === 0) vars.push("x", "y");

  // Compute each partial derivative (sequential awaits — order matters for display)
  const components: string[] = [];
  for (const vi of vars) {
    const comp = await giacLatex(`diff(${giacExpr},${vi})`);
    if (!comp) return null;
    components.push(comp.replace(/^\$/, "").replace(/\$$/, "").replace(/^"|"$/g, ""));
  }

  const resultLatex = `\\nabla f = \\left(${components.join(",\\, ")}\\right)`;
  const resultText = latexToReadable(resultLatex);
  return ok(
    { latex: resultLatex, text: resultText },
    [{ level: "info", message: `Gradient in ${vars.length}D (Giac)` }],
  );
}

// ══════════════════════════════════════════════════════════════
//  STEP-BY-STEP SOLUTIONS
// ══════════════════════════════════════════════════════════════

/**
 * Named rule patterns matched against Giac debug messages.
 * Each entry maps a regex (case-insensitive) to a human-readable rule name.
 */
const STEP_RULE_PATTERNS: [RegExp, string][] = [
  [/integration by parts/i, "Integration by Parts"],
  [/u[- ]?substitution|change of variable/i, "u-Substitution"],
  [/partial fraction/i, "Partial Fraction Decomposition"],
  [/chain rule/i, "Chain Rule"],
  [/power rule/i, "Power Rule"],
  [/product rule/i, "Product Rule"],
  [/quotient rule/i, "Quotient Rule"],
  [/trig(onometric)?\s+(identity|substitution)/i, "Trigonometric Substitution"],
  [/l'?hopital|l'?h.pital/i, "L'Hopital's Rule"],
  [/linearity/i, "Linearity"],
  [/constant\s+(multiple|factor)/i, "Constant Multiple Rule"],
  [/sum\s+rule/i, "Sum Rule"],
  [/logarithm(ic)?\s+(rule|integration|differentiation)/i, "Logarithmic Rule"],
  [/exponential/i, "Exponential Rule"],
];

/**
 * Noise patterns that should be filtered from Giac debug output.
 * These are internal markers, memory addresses, debug commands, and
 * other artifacts that carry no mathematical meaning.
 */
function isNoiseStep(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.startsWith("//")) return true;
  if (/^debug_infolevel/.test(t)) return true;
  // Pure numeric lines (debug counters)
  if (/^\d+$/.test(t)) return true;
  if (t === "1" || t === "0") return true;
  // Memory addresses / pointer dumps
  if (/^0x[0-9a-f]+$/i.test(t)) return true;
  // Internal variable names like _tmp123, __ret, gen_0
  if (/^[_]{1,2}[a-zA-Z0-9_]+$/.test(t)) return true;
  if (/^gen_\d+/.test(t)) return true;
  // Lines that are just whitespace or single punctuation
  if (/^[{}\[\]();,]+$/.test(t)) return true;
  // Very short lines that are just status markers
  if (t.length <= 2 && !/[=>]/.test(t)) return true;
  return false;
}

/**
 * Classify a Giac debug line into a named rule or return a cleaned description.
 * If the line matches a known calculus rule, returns the rule name.
 * If the line contains "=>" or a Unicode arrow, extracts it as an intermediate step.
 * Otherwise returns the cleaned text.
 */
function classifyStep(raw: string): { label: string; intermediate?: string } {
  const trimmed = raw.trim();

  // Check against known rule patterns
  for (const [re, name] of STEP_RULE_PATTERNS) {
    if (re.test(trimmed)) {
      return { label: name };
    }
  }

  // Lines with => or arrows indicate intermediate transformations
  const arrowMatch = trimmed.match(/^(.+?)\s*(?:=>|→|->)\s*(.+)$/);
  if (arrowMatch) {
    const from = arrowMatch[1].trim();
    const to = arrowMatch[2].trim();
    return {
      label: `${giacSyntaxToLatex(from)} \\Rightarrow ${giacSyntaxToLatex(to)}`,
      intermediate: to,
    };
  }

  // Default: clean up and return as-is
  return { label: trimmed };
}

/**
 * Convert common Giac syntax patterns to LaTeX for display in step output.
 * Handles: ^ → LaTeX power, * → \cdot, common functions, Greek letters.
 */
function giacSyntaxToLatex(s: string): string {
  return s
    // Exponentiation: x^2 → x^{2}, x^(n+1) → x^{n+1}
    .replace(/\^(\([^)]+\))/g, (_, exp) => `^{${exp.slice(1, -1)}}`)
    .replace(/\^(\d+)/g, "^{$1}")
    // Multiplication: explicit * → \cdot (but not ** which is power)
    .replace(/(?<!\*)\*(?!\*)/g, " \\cdot ")
    // Common functions
    .replace(/\bsqrt\(/g, "\\sqrt{").replace(/\bsqrt\{([^}]+)\}/g, (_, inner) => `\\sqrt{${inner}}`)
    .replace(/\bsin\(/g, "\\sin(").replace(/\bcos\(/g, "\\cos(").replace(/\btan\(/g, "\\tan(")
    .replace(/\bln\(/g, "\\ln(").replace(/\blog\(/g, "\\log(").replace(/\bexp\(/g, "\\exp(")
    .replace(/\barcsin\(/g, "\\arcsin(").replace(/\barccos\(/g, "\\arccos(").replace(/\barctan\(/g, "\\arctan(")
    // Greek letters
    .replace(/\bpi\b/g, "\\pi").replace(/\balpha\b/g, "\\alpha").replace(/\bbeta\b/g, "\\beta")
    .replace(/\btheta\b/g, "\\theta").replace(/\bphi\b/g, "\\phi")
    // Infinity
    .replace(/\binf\b/g, "\\infty")
    .trim();
}

/**
 * Escape special LaTeX characters in plain-text step descriptions
 * so they render cleanly inside \text{}.
 */
function formatStepText(step: string): string {
  return step
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\$/g, "\\$")
    .slice(0, 120);
}

/**
 * Build a formatted Result from step-by-step Giac output.
 *
 * Parses Giac debug messages into structured, numbered steps:
 * 1. Filters noise lines (debug markers, memory addresses, internal variables)
 * 2. Classifies each step against known calculus rule patterns
 * 3. Converts Giac syntax to LaTeX where possible
 * 4. Numbers each step and formats as gathered LaTeX environment
 * 5. Ends with "Result: [final answer]"
 */
function formatStepResultFn(
  operation: string,
  steps: string[],
  resultLatex: string,
): Result<EvalResult> {
  // Clean up result LaTeX
  let cleanResult = resultLatex.trim();
  if (cleanResult.startsWith('"') && cleanResult.endsWith('"'))
    cleanResult = cleanResult.slice(1, -1);
  if (cleanResult.startsWith("$") && cleanResult.endsWith("$"))
    cleanResult = cleanResult.slice(1, -1);
  cleanResult = cleanResult
    .replace(/\\mathit\{([^{}]+)\}/g, "$1")
    .replace(/\\mathrm\{([^{}]+)\}/g, "\\operatorname{$1}");

  // Filter out noise and classify meaningful steps
  const meaningfulSteps = steps.filter((s) => !isNoiseStep(s));

  if (meaningfulSteps.length === 0) {
    // No steps captured — just show the result
    return ok(
      { latex: cleanResult, text: latexToReadable(cleanResult) },
      [{ level: "info", message: `${operation} complete — no step details available from Giac` }],
    );
  }

  // Classify and deduplicate steps
  const classified: { label: string; intermediate?: string }[] = [];
  const seenLabels = new Set<string>();
  for (const raw of meaningfulSteps) {
    const step = classifyStep(raw);
    // Deduplicate consecutive identical labels (Giac often repeats rule names)
    if (!seenLabels.has(step.label)) {
      classified.push(step);
      seenLabels.add(step.label);
    }
  }

  // Build multi-line LaTeX: numbered steps + result
  const stepLines = classified.map((step, i) => {
    const num = i + 1;
    // If the label contains LaTeX math (arrows, powers), render it as math
    if (step.label.includes("\\") || step.label.includes("^")) {
      return `\\text{Step ${num}: }${step.label}`;
    }
    return `\\text{Step ${num}: ${formatStepText(step.label)}}`;
  });

  const resultLine = `\\text{Result: }${cleanResult}`;
  const stepsLatex =
    stepLines.join(" \\\\ ") + " \\\\ \\hline " + resultLine;
  const fullLatex = `\\begin{gathered}${stepsLatex}\\end{gathered}`;

  // Plain text version
  const text =
    classified.map((step, i) => {
      const num = i + 1;
      // Strip LaTeX from the label for text output
      const plainLabel = step.label
        .replace(/\\Rightarrow/g, "=>")
        .replace(/\\cdot/g, "*")
        .replace(/\\[a-zA-Z]+/g, "")
        .replace(/[{}]/g, "")
        .trim();
      return `Step ${num}: ${plainLabel}`;
    }).join("\n") +
    "\nResult: " +
    latexToReadable(cleanResult);

  return ok(
    { latex: fullLatex, text },
    [{ level: "info", message: `${operation} with ${classified.length} steps (Giac)` }],
  );
}

/**
 * Perform a CAS operation with step-by-step output.
 *
 * Auto-detects the operation from the expression:
 * - Contains \int → integration steps
 * - Contains = → solving steps
 * - Otherwise → differentiation steps
 *
 * Requires Giac WASM with debug_infolevel support.
 */
export async function giacSteps(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;

  const giacExpr = latexToGiac(latex);
  const v = resolveVariable(latex);
  let operation: string;
  let giacCmd: string;

  // Auto-detect operation
  if (/\\int/.test(latex)) {
    // Integration — strip \int and trailing dx/dt
    let integrand = latex
      .replace(/\\int\s*/, "")
      .replace(/\\,\s*d[a-zA-Z]\s*$/, "")
      .replace(/\s*d[a-zA-Z]\s*$/, "")
      .trim();

    // Handle definite integral bounds
    const defInt = parseDefiniteIntegral(latex);
    if (defInt) {
      integrand = defInt.integrand
        .replace(/\\,\s*d[a-zA-Z]\s*$/, "")
        .replace(/\s*d[a-zA-Z]\s*$/, "")
        .trim();
      const integrandGiac = latexToGiac(integrand);
      const loGiac = latexToGiac(defInt.lo);
      const hiGiac = latexToGiac(defInt.hi);
      operation = "Integration";
      giacCmd = `integrate(${integrandGiac},${v},${loGiac},${hiGiac})`;
    } else {
      const integrandGiac = latexToGiac(integrand);
      operation = "Integration";
      giacCmd = `integrate(${integrandGiac},${v})`;
    }
  } else if (latex.includes("=")) {
    // Solving
    const solveExpr = giacExpr.includes("=") ? giacExpr : `${giacExpr}=0`;
    operation = "Solving";
    giacCmd = `solve(${solveExpr},${v})`;
  } else {
    // Default: differentiation
    operation = "Differentiation";
    giacCmd = `diff(${giacExpr},${v})`;
  }

  // Run with step capture
  const result = await workerEvalWithSteps(giacCmd);
  if (!result.value) return null;

  // Get LaTeX form of the result
  const latexCmd = giacCmd.startsWith("solve(")
    ? giacCmd
    : `latex(${giacCmd})`;
  const resultLatex = await giacRawEval(latexCmd);
  if (!resultLatex) {
    // Steps captured but no LaTeX — format result.value as-is
    return formatStepResultFn(operation, result.steps, result.value);
  }

  return formatStepResultFn(operation, result.steps, resultLatex);
}

/** Laplace transform using Giac: laplace(expr, t, s) */
export async function giacLaplace(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  // Detect the time-domain variable by checking for isolated 't' (not inside \tan, \text, etc.)
  const timeVar = /(?<![a-zA-Z\\])t(?![a-zA-Z])/.test(latex) ? "t" : "x";
  const result = await giacLatex(`laplace(${giacExpr},${timeVar},s)`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Laplace transform (${timeVar} → s) (Giac)` }]);
}

/** Inverse Laplace transform using Giac: ilaplace(expr, s, t) */
export async function giacILaplace(latex: string): Promise<Result<EvalResult> | null> {
  if (!giacReady) return null;
  const giacExpr = latexToGiac(latex);
  // Detect the frequency-domain variable by checking for isolated 's' (not inside \sin, \sec, etc.)
  const freqVar = /(?<![a-zA-Z\\])s(?![a-zA-Z])/.test(latex) ? "s" : "z";
  const result = await giacLatex(`ilaplace(${giacExpr},${freqVar},t)`);
  if (!result) return null;
  return makeResult(result, [{ level: "info", message: `Inverse Laplace (${freqVar} → t) (Giac)` }]);
}
