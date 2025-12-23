import { dlopen, FFIType, ptr, toArrayBuffer, suffix, type Pointer } from "bun:ffi"
import path from "path"
import { platform, arch } from "os"
import stripAnsi from "strip-ansi"

// =============================================================================
// FFI Library Loading
// =============================================================================

function getLibPath(): string | null {
  const p = platform()
  const a = arch()

  // Try development path first
  const devPath = path.join(import.meta.dir, "..", "zig-out", "lib", `libghostty-opentui.${suffix}`)
  try {
    // Check if file exists by trying to open it
    Bun.file(devPath).size
    return devPath
  } catch {
    // Development path doesn't exist, try dist paths
  }

  // Map platform/arch to dist path
  if (p === "darwin" && a === "arm64") {
    return path.join(import.meta.dir, "..", "dist", "darwin-arm64", `libghostty-opentui.${suffix}`)
  }
  if (p === "darwin" && a === "x64") {
    return path.join(import.meta.dir, "..", "dist", "darwin-x64", `libghostty-opentui.${suffix}`)
  }
  if (p === "linux" && a === "arm64") {
    return path.join(import.meta.dir, "..", "dist", "linux-arm64", `libghostty-opentui.${suffix}`)
  }
  if (p === "linux" && a === "x64") {
    return path.join(import.meta.dir, "..", "dist", "linux-x64", `libghostty-opentui.${suffix}`)
  }

  // Windows or unsupported platform - return null for fallback
  return null
}

// Try to load the native library
let lib: ReturnType<typeof dlopen<typeof symbols>> | null = null
const symbols = {
  // Arena management
  freeArena: {
    args: [] as const,
    returns: FFIType.void,
  },

  // Stateless functions
  ptyToJson: {
    args: [FFIType.ptr, "usize" as const, FFIType.u16, FFIType.u16, "usize" as const, "usize" as const, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  ptyToText: {
    args: [FFIType.ptr, "usize" as const, FFIType.u16, FFIType.u16, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  ptyToHtml: {
    args: [FFIType.ptr, "usize" as const, FFIType.u16, FFIType.u16, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },

  // Persistent terminal functions
  createTerminal: {
    args: [FFIType.u32, FFIType.u32, FFIType.u32] as const,
    returns: FFIType.bool,
  },
  destroyTerminal: {
    args: [FFIType.u32] as const,
    returns: FFIType.void,
  },
  feedTerminal: {
    args: [FFIType.u32, FFIType.ptr, "usize" as const] as const,
    returns: FFIType.bool,
  },
  resizeTerminal: {
    args: [FFIType.u32, FFIType.u32, FFIType.u32] as const,
    returns: FFIType.bool,
  },
  resetTerminal: {
    args: [FFIType.u32] as const,
    returns: FFIType.bool,
  },
  getTerminalJson: {
    args: [FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  getTerminalText: {
    args: [FFIType.u32, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  getTerminalCursor: {
    args: [FFIType.u32, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  isTerminalReady: {
    args: [FFIType.u32] as const,
    returns: FFIType.i32,
  },
} as const

const libPath = getLibPath()
if (libPath) {
  try {
    lib = dlopen(libPath, symbols)
  } catch {
    // Failed to load library
    lib = null
  }
}

// =============================================================================
// Type Definitions
// =============================================================================

export interface TerminalSpan {
  text: string
  fg: string | null
  bg: string | null
  flags: number
  width: number
}

export interface TerminalLine {
  spans: TerminalSpan[]
}

export interface TerminalData {
  cols: number
  rows: number
  cursor: [number, number]
  offset: number
  totalLines: number
  lines: TerminalLine[]
}

export interface PtyToJsonOptions {
  cols?: number
  rows?: number
  offset?: number
  limit?: number
}

// =============================================================================
// Helper Functions
// =============================================================================

function readStringFromPointer(resultPtr: Pointer | null, outLenBuffer: BigUint64Array): string {
  if (!resultPtr) {
    throw new Error("Native function returned null")
  }

  const outLen = Number(outLenBuffer[0])
  const buffer = toArrayBuffer(resultPtr, 0, outLen)
  const str = new TextDecoder().decode(buffer)

  lib!.symbols.freeArena()

  return str
}

// =============================================================================
// Fallback Implementations (for Windows or when native unavailable)
// =============================================================================

/**
 * Windows fallback: strips ANSI codes and returns plain text lines
 */
function ptyToJsonFallback(input: Buffer | Uint8Array | string, options: PtyToJsonOptions = {}): TerminalData {
  const { cols = 120, rows = 40, offset = 0, limit = 0 } = options

  const text = typeof input === "string" ? input : input.toString("utf-8")
  const plainText = stripAnsi(text)
  const allLines = plainText.split("\n")

  // Apply offset and limit
  const startLine = offset
  const endLine = limit > 0 ? Math.min(startLine + limit, allLines.length) : allLines.length
  const selectedLines = allLines.slice(startLine, endLine)

  return {
    cols,
    rows,
    cursor: [0, selectedLines.length],
    offset,
    totalLines: allLines.length,
    lines: selectedLines.map((lineText) => ({
      spans: [{ text: lineText, fg: null, bg: null, flags: 0, width: lineText.length }],
    })),
  }
}

/**
 * Windows fallback: strips ANSI codes and returns plain text
 */
function ptyToTextFallback(input: Buffer | Uint8Array | string): string {
  const text = typeof input === "string" ? input : input.toString("utf-8")
  return stripAnsi(text)
}

/**
 * Windows fallback: wraps plain text in pre tags
 */
function ptyToHtmlFallback(input: Buffer | Uint8Array | string): string {
  const text = typeof input === "string" ? input : input.toString("utf-8")
  const plainText = stripAnsi(text)
  // Escape HTML entities
  const escaped = plainText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
  return `<pre style="font-family: monospace;">${escaped}</pre>`
}

// =============================================================================
// Public API
// =============================================================================

export function ptyToJson(input: Buffer | Uint8Array | string, options: PtyToJsonOptions = {}): TerminalData {
  // Fallback for Windows or if native module not available
  if (!lib) {
    return ptyToJsonFallback(input, options)
  }

  const { cols = 120, rows = 40, offset = 0, limit = 0 } = options

  const inputStr = typeof input === "string" ? input : input.toString("utf-8")

  // Handle empty input
  if (inputStr.length === 0) {
    return {
      cols,
      rows,
      cursor: [0, 0],
      offset,
      totalLines: 0,
      lines: [],
    }
  }

  const inputBuffer = Buffer.from(inputStr)
  const inputPtr = ptr(inputBuffer)

  const outLenBuffer = new BigUint64Array(1)
  const outLenPtr = ptr(outLenBuffer)

  const resultPtr = lib.symbols.ptyToJson(inputPtr, inputBuffer.length, cols, rows, offset, limit, outLenPtr)

  const jsonStr = readStringFromPointer(resultPtr, outLenBuffer)

  const raw = JSON.parse(jsonStr) as {
    cols: number
    rows: number
    cursor: [number, number]
    offset: number
    totalLines: number
    lines: Array<Array<[string, string | null, string | null, number, number]>>
  }

  return {
    cols: raw.cols,
    rows: raw.rows,
    cursor: raw.cursor,
    offset: raw.offset,
    totalLines: raw.totalLines,
    lines: raw.lines.map((line) => ({
      spans: line.map(([text, fg, bg, flags, width]) => ({
        text,
        fg,
        bg,
        flags,
        width,
      })),
    })),
  }
}

export interface PtyToTextOptions {
  cols?: number
  rows?: number
}

/**
 * Strips ANSI escape codes from input and returns plain text.
 * Uses the terminal emulator to properly process escape sequences,
 * then outputs only the visible text content.
 *
 * Useful for cleaning terminal output before sending to LLMs or other text processors.
 */
export function ptyToText(input: Buffer | Uint8Array | string, options: PtyToTextOptions = {}): string {
  // Fallback for Windows or if native module not available
  if (!lib) {
    return ptyToTextFallback(input)
  }

  // Large rows = less scrolling = fewer pages = cheaper
  // cols affects line wrapping (high default to avoid unwanted wraps)
  const { cols = 500, rows = 256 } = options

  const inputStr = typeof input === "string" ? input : input.toString("utf-8")

  // Handle empty input
  if (inputStr.length === 0) {
    return ""
  }

  const inputBuffer = Buffer.from(inputStr)
  const inputPtr = ptr(inputBuffer)

  const outLenBuffer = new BigUint64Array(1)
  const outLenPtr = ptr(outLenBuffer)

  const resultPtr = lib.symbols.ptyToText(inputPtr, inputBuffer.length, cols, rows, outLenPtr)

  return readStringFromPointer(resultPtr, outLenBuffer)
}

export interface PtyToHtmlOptions {
  cols?: number
  rows?: number
}

/**
 * Converts terminal output with ANSI escape codes to styled HTML.
 * Uses the terminal emulator to properly process escape sequences,
 * then outputs HTML with inline styles for colors and text attributes.
 *
 * Useful for rendering terminal output in web pages or HTML documents.
 */
export function ptyToHtml(input: Buffer | Uint8Array | string, options: PtyToHtmlOptions = {}): string {
  // Fallback for Windows or if native module not available
  if (!lib) {
    return ptyToHtmlFallback(input)
  }

  // Large rows = less scrolling = fewer pages = cheaper
  // cols affects line wrapping (high default to avoid unwanted wraps)
  const { cols = 500, rows = 256 } = options

  const inputStr = typeof input === "string" ? input : input.toString("utf-8")

  // Handle empty input
  if (inputStr.length === 0) {
    return ""
  }

  const inputBuffer = Buffer.from(inputStr)
  const inputPtr = ptr(inputBuffer)

  const outLenBuffer = new BigUint64Array(1)
  const outLenPtr = ptr(outLenBuffer)

  const resultPtr = lib.symbols.ptyToHtml(inputPtr, inputBuffer.length, cols, rows, outLenPtr)

  return readStringFromPointer(resultPtr, outLenBuffer)
}

export const StyleFlags = {
  BOLD: 1,
  ITALIC: 2,
  UNDERLINE: 4,
  STRIKETHROUGH: 8,
  INVERSE: 16,
  FAINT: 32,
} as const

// =============================================================================
// Persistent Terminal API
// =============================================================================

let nextTerminalId = 1

/**
 * Generate a unique terminal ID
 */
function generateTerminalId(): number {
  return nextTerminalId++
}

/**
 * Check if native persistent terminal API is available
 */
export function hasPersistentTerminalSupport(): boolean {
  return lib !== null
}

export interface PersistentTerminalOptions {
  cols?: number
  rows?: number
}

/**
 * A persistent terminal instance that maintains state across multiple feed operations.
 * Much more efficient than ptyToJson for streaming use cases.
 */
export class PersistentTerminal {
  private readonly _id: number
  private _cols: number
  private _rows: number
  private _destroyed = false

  constructor(options: PersistentTerminalOptions = {}) {
    if (!lib) {
      throw new Error("Native module not available - PersistentTerminal requires native support")
    }

    this._id = generateTerminalId()
    this._cols = options.cols ?? 120
    this._rows = options.rows ?? 40

    const success = lib.symbols.createTerminal(this._id, this._cols, this._rows)
    if (!success) {
      throw new Error("Failed to create terminal")
    }
  }

  /** The unique identifier for this terminal */
  get id(): number {
    return this._id
  }

  /** Current number of columns */
  get cols(): number {
    return this._cols
  }

  /** Current number of rows */
  get rows(): number {
    return this._rows
  }

  /** Whether this terminal has been destroyed */
  get destroyed(): boolean {
    return this._destroyed
  }

  /**
   * Feed data to the terminal. Can be called multiple times for streaming.
   * The terminal maintains state (cursor position, colors, etc.) between calls.
   */
  feed(data: Buffer | Uint8Array | string): void {
    this.assertNotDestroyed()
    let str: string
    if (typeof data === "string") {
      str = data
    } else if (Buffer.isBuffer(data)) {
      str = data.toString("utf-8")
    } else {
      // Uint8Array - use TextDecoder
      str = new TextDecoder("utf-8").decode(data)
    }

    const buffer = Buffer.from(str)
    const success = lib!.symbols.feedTerminal(this._id, ptr(buffer), buffer.length)
    if (!success) {
      throw new Error("Failed to feed terminal - terminal may not exist")
    }
  }

  /**
   * Resize the terminal. Existing content will be reflowed if possible.
   */
  resize(cols: number, rows: number): void {
    this.assertNotDestroyed()
    this._cols = cols
    this._rows = rows
    const success = lib!.symbols.resizeTerminal(this._id, cols, rows)
    if (!success) {
      throw new Error("Failed to resize terminal - terminal may not exist")
    }
  }

  /**
   * Reset the terminal to its initial state.
   * Clears all content and resets cursor to origin.
   */
  reset(): void {
    this.assertNotDestroyed()
    const success = lib!.symbols.resetTerminal(this._id)
    if (!success) {
      throw new Error("Failed to reset terminal - terminal may not exist")
    }
  }

  /**
   * Get the current terminal content as TerminalData.
   */
  getJson(options: { offset?: number; limit?: number } = {}): TerminalData {
    this.assertNotDestroyed()
    const { offset = 0, limit = 0 } = options

    const outLenBuffer = new BigUint64Array(1)
    const outLenPtr = ptr(outLenBuffer)

    const resultPtr = lib!.symbols.getTerminalJson(this._id, offset, limit, outLenPtr)
    if (!resultPtr) {
      throw new Error("Failed to get terminal JSON - terminal may not exist")
    }

    const jsonStr = readStringFromPointer(resultPtr, outLenBuffer)
    const raw = JSON.parse(jsonStr) as {
      cols: number
      rows: number
      cursor: [number, number]
      offset: number
      totalLines: number
      lines: Array<Array<[string, string | null, string | null, number, number]>>
    }

    return {
      cols: raw.cols,
      rows: raw.rows,
      cursor: raw.cursor,
      offset: raw.offset,
      totalLines: raw.totalLines,
      lines: raw.lines.map((line) => ({
        spans: line.map(([text, fg, bg, flags, width]) => ({
          text,
          fg,
          bg,
          flags,
          width,
        })),
      })),
    }
  }

  /**
   * Get the current terminal content as plain text.
   */
  getText(): string {
    this.assertNotDestroyed()

    const outLenBuffer = new BigUint64Array(1)
    const outLenPtr = ptr(outLenBuffer)

    const resultPtr = lib!.symbols.getTerminalText(this._id, outLenPtr)
    if (!resultPtr) {
      throw new Error("Failed to get terminal text - terminal may not exist")
    }

    return readStringFromPointer(resultPtr, outLenBuffer)
  }

  /**
   * Get the current cursor position as [x, y].
   */
  getCursor(): [number, number] {
    this.assertNotDestroyed()

    const outLenBuffer = new BigUint64Array(1)
    const outLenPtr = ptr(outLenBuffer)

    const resultPtr = lib!.symbols.getTerminalCursor(this._id, outLenPtr)
    if (!resultPtr) {
      throw new Error("Failed to get terminal cursor - terminal may not exist")
    }

    const jsonStr = readStringFromPointer(resultPtr, outLenBuffer)
    return JSON.parse(jsonStr) as [number, number]
  }

  /**
   * Check if the terminal is ready for reading.
   * Returns true if the parser is in ground state, meaning all escape
   * sequences have been fully processed.
   *
   * Use this after feed() to ensure you're not reading partial state.
   */
  isReady(): boolean {
    this.assertNotDestroyed()
    const result = lib!.symbols.isTerminalReady(this._id)
    if (result === -1) {
      throw new Error("Failed to check terminal ready state - terminal may not exist")
    }
    return result === 1
  }

  /**
   * Destroy the terminal and free resources.
   * The terminal cannot be used after this call.
   */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    lib!.symbols.destroyTerminal(this._id)
  }

  private assertNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error("Terminal has been destroyed")
    }
  }
}
