import { createRequire } from "module"
import path from "path"
import fs from "fs"
import stripAnsi from "strip-ansi"

const require = createRequire(import.meta.url)

const IS_WINDOWS = process.platform === "win32"

interface NativeModule {
  ptyToJson(input: string, cols: number, rows: number, offset: number, limit: number): string
  ptyToText(input: string, cols: number, rows: number): string
  ptyToHtml(input: string, cols: number, rows: number): string
}

function getNodePath(): string {
  const nodeName = "ghostty-opentui.node"

  // Check local development path (zig-out) first for development
  const devPath = path.join(import.meta.dir, "..", "zig-out", "lib", nodeName)
  if (fs.existsSync(devPath)) {
    return devPath
  }

  // Check npm package dist paths
  const distPath = path.join(import.meta.dir, "..", "dist", nodeName)
  if (fs.existsSync(distPath)) {
    return distPath
  }

  throw new Error(
    `Could not find native library ${nodeName}. ` +
      `Looked in:\n  - ${devPath}\n  - ${distPath}\n` +
      `Make sure to run 'zig build' or install the package with binaries.`
  )
}

// Only load native library on non-Windows platforms
const native: NativeModule | null = IS_WINDOWS ? null : require(getNodePath())

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
  // Windows fallback: strip ANSI and return plain text
  if (IS_WINDOWS || !native) {
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
  // Windows fallback: strip ANSI and return plain text
  if (IS_WINDOWS || !native) {
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
  // Windows fallback
  if (IS_WINDOWS || !native) {
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
