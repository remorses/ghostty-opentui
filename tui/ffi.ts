import { platform, arch } from "os"
import stripAnsi from "strip-ansi"

interface NativeModule {
  // Stateless functions (create terminal each call)
  ptyToJson(input: string, cols: number, rows: number, offset: number, limit: number): string
  ptyToText(input: string, cols: number, rows: number): string
  ptyToHtml(input: string, cols: number, rows: number): string

  // Persistent terminal management functions
  createTerminal(id: number, cols: number, rows: number): void
  destroyTerminal(id: number): void
  feedTerminal(id: number, data: string): void
  resizeTerminal(id: number, cols: number, rows: number): void
  resetTerminal(id: number): void
  getTerminalJson(id: number, offset: number, limit: number): string
  getTerminalText(id: number): string
  getTerminalCursor(id: number): string
}

function loadNativeModule(): NativeModule | null {
  // Try development path first
  try {
    return require("../zig-out/lib/ghostty-opentui.node")
  } catch {}

  // Load platform-specific dist path (hardcoded for static analysis)
  const p = platform()
  const a = arch()

  if (p === "darwin" && a === "arm64") {
    return require("../dist/darwin-arm64/ghostty-opentui.node")
  }
  if (p === "darwin") {
    return require("../dist/darwin-x64/ghostty-opentui.node")
  }
  if (p === "linux" && a === "arm64") {
    return require("../dist/linux-arm64/ghostty-opentui.node")
  }
  if (p === "linux") {
    return require("../dist/linux-x64/ghostty-opentui.node")
  }
  if (p === "win32") {
    // Windows fallback - no native module
    return null
  }

  throw new Error(`Unsupported platform: ${p}-${a}`)
}

const native: NativeModule | null = loadNativeModule()

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

export function ptyToJson(input: Buffer | Uint8Array | string, options: PtyToJsonOptions = {}): TerminalData {
  // Fallback for Windows or if native module not available
  if (!native) {
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

  const jsonStr = native.ptyToJson(inputStr, cols, rows, offset, limit)

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
 * Windows fallback: strips ANSI codes and returns plain text
 */
function ptyToTextFallback(input: Buffer | Uint8Array | string, options: PtyToTextOptions = {}): string {
  const text = typeof input === "string" ? input : input.toString("utf-8")
  return stripAnsi(text)
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
  if (!native) {
    return ptyToTextFallback(input, options)
  }

  // Large rows = less scrolling = fewer pages = cheaper
  // cols affects line wrapping (high default to avoid unwanted wraps)
  const { cols = 500, rows = 256 } = options

  const inputStr = typeof input === "string" ? input : input.toString("utf-8")

  // Handle empty input
  if (inputStr.length === 0) {
    return ""
  }

  return native.ptyToText(inputStr, cols, rows)
}

export interface PtyToHtmlOptions {
  cols?: number
  rows?: number
}

/**
 * Windows fallback: wraps plain text in pre tags
 */
function ptyToHtmlFallback(input: Buffer | Uint8Array | string, options: PtyToHtmlOptions = {}): string {
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

/**
 * Converts terminal output with ANSI escape codes to styled HTML.
 * Uses the terminal emulator to properly process escape sequences,
 * then outputs HTML with inline styles for colors and text attributes.
 *
 * Useful for rendering terminal output in web pages or HTML documents.
 */
export function ptyToHtml(input: Buffer | Uint8Array | string, options: PtyToHtmlOptions = {}): string {
  // Fallback for Windows or if native module not available
  if (!native) {
    return ptyToHtmlFallback(input, options)
  }

  // Large rows = less scrolling = fewer pages = cheaper
  // cols affects line wrapping (high default to avoid unwanted wraps)
  const { cols = 500, rows = 256 } = options

  const inputStr = typeof input === "string" ? input : input.toString("utf-8")

  // Handle empty input
  if (inputStr.length === 0) {
    return ""
  }

  return native.ptyToHtml(inputStr, cols, rows)
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
  return native !== null && typeof native.createTerminal === "function"
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
    if (!native) {
      throw new Error("Native module not available - PersistentTerminal requires native support")
    }

    this._id = generateTerminalId()
    this._cols = options.cols ?? 120
    this._rows = options.rows ?? 40

    native.createTerminal(this._id, this._cols, this._rows)
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
    native!.feedTerminal(this._id, str)
  }

  /**
   * Resize the terminal. Existing content will be reflowed if possible.
   */
  resize(cols: number, rows: number): void {
    this.assertNotDestroyed()
    this._cols = cols
    this._rows = rows
    native!.resizeTerminal(this._id, cols, rows)
  }

  /**
   * Reset the terminal to its initial state.
   * Clears all content and resets cursor to origin.
   */
  reset(): void {
    this.assertNotDestroyed()
    native!.resetTerminal(this._id)
  }

  /**
   * Get the current terminal content as TerminalData.
   */
  getJson(options: { offset?: number; limit?: number } = {}): TerminalData {
    this.assertNotDestroyed()
    const { offset = 0, limit = 0 } = options

    const jsonStr = native!.getTerminalJson(this._id, offset, limit)
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
    return native!.getTerminalText(this._id)
  }

  /**
   * Get the current cursor position as [x, y].
   */
  getCursor(): [number, number] {
    this.assertNotDestroyed()
    const json = native!.getTerminalCursor(this._id)
    return JSON.parse(json) as [number, number]
  }

  /**
   * Destroy the terminal and free resources.
   * The terminal cannot be used after this call.
   */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    native!.destroyTerminal(this._id)
  }

  private assertNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error("Terminal has been destroyed")
    }
  }
}
