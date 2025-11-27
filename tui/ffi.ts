import { dlopen, FFIType, ptr, suffix, toArrayBuffer } from "bun:ffi"
import path from "path"
import fs from "fs"
import os from "os"
import stripAnsi from "strip-ansi"

const IS_WINDOWS = process.platform === "win32"

// Embed native libraries for bun compile (type: "file" embeds them in the binary)
// @ts-ignore - import attribute for embedding binary files
import embeddedDarwinArm64 from "../dist/darwin-arm64/libpty-to-json.dylib" with { type: "file" }
// @ts-ignore - import attribute for embedding binary files
import embeddedDarwinX64 from "../dist/darwin-x64/libpty-to-json.dylib" with { type: "file" }
// @ts-ignore - import attribute for embedding binary files
import embeddedLinuxX64 from "../dist/linux-x64/libpty-to-json.so" with { type: "file" }
// @ts-ignore - import attribute for embedding binary files
import embeddedLinuxArm64 from "../dist/linux-arm64/libpty-to-json.so" with { type: "file" }

function getPlatformTarget(): string {
  const platform = process.platform
  const arch = os.arch()

  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64"
  } else if (platform === "linux") {
    return arch === "arm64" ? "linux-arm64" : "linux-x64"
  }
  throw new Error(`Unsupported platform: ${platform}-${arch}`)
}

function getEmbeddedLib(): string | undefined {
  const target = getPlatformTarget()
  const libs: Record<string, string> = {
    "darwin-arm64": embeddedDarwinArm64,
    "darwin-x64": embeddedDarwinX64,
    "linux-x64": embeddedLinuxX64,
    "linux-arm64": embeddedLinuxArm64,
  }
  return libs[target]
}

function getLibPath(): string {
  const libName = `libpty-to-json.${suffix}`
  const target = getPlatformTarget()

  // Check local development path (zig-out) first for development
  const devPath = path.join(import.meta.dir, "..", "zig-out", "lib", libName)
  if (fs.existsSync(devPath)) {
    return devPath
  }

  // Check embedded libraries (for bun compile)
  const embedded = getEmbeddedLib()
  if (embedded && fs.existsSync(embedded)) {
    return embedded
  }

  // Check npm package dist paths
  const distPath = path.join(import.meta.dir, "..", "dist", target, libName)
  if (fs.existsSync(distPath)) {
    return distPath
  }

  throw new Error(
    `Could not find native library ${libName}. ` +
      `Looked in:\n  - ${devPath}\n  - ${distPath}\n` +
      `Make sure to run 'zig build' or install the package with binaries.`
  )
}

// Only load native library on non-Windows platforms
const lib = IS_WINDOWS
  ? null
  : dlopen(getLibPath(), {
      ptyToJson: {
        args: [FFIType.ptr, FFIType.u64, FFIType.u16, FFIType.u16, FFIType.u64, FFIType.u64, FFIType.ptr],
        returns: FFIType.ptr,
      },
      ptyToText: {
        args: [FFIType.ptr, FFIType.u64, FFIType.u16, FFIType.u16, FFIType.ptr],
        returns: FFIType.ptr,
      },
      freeArena: {
        args: [],
        returns: FFIType.void,
      },
    })

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
  if (IS_WINDOWS || !lib) {
    return ptyToJsonFallback(input, options)
  }

  const { cols = 120, rows = 40, offset = 0, limit = 0 } = options

  const inputBuffer = typeof input === "string" ? Buffer.from(input) : input
  const inputArray = inputBuffer instanceof Buffer ? new Uint8Array(inputBuffer) : inputBuffer

  // Handle empty input (bun:ffi throws on empty array pointer)
  const safeInputArray = inputArray.length === 0 ? new Uint8Array(1) : inputArray
  const inputPtr = ptr(safeInputArray)

  const outLenBuffer = new BigUint64Array(1)
  const outLenPtr = ptr(outLenBuffer)

  const resultPtr = lib.symbols.ptyToJson(inputPtr, inputArray.length, cols, rows, offset, limit, outLenPtr)

  if (!resultPtr) {
    lib.symbols.freeArena()
    throw new Error("ptyToJson returned null")
  }

  const outLen = Number(outLenBuffer[0])
  const jsonBuffer = toArrayBuffer(resultPtr, 0, outLen)
  const jsonStr = new TextDecoder().decode(jsonBuffer)

  lib.symbols.freeArena()

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
  if (IS_WINDOWS || !lib) {
    return ptyToTextFallback(input, options)
  }

  // Large rows = less scrolling = fewer pages = cheaper
  // cols affects line wrapping (high default to avoid unwanted wraps)
  const { cols = 500, rows = 256 } = options

  const inputBuffer = typeof input === "string" ? Buffer.from(input) : input
  const inputArray = inputBuffer instanceof Buffer ? new Uint8Array(inputBuffer) : inputBuffer

  // Handle empty input
  if (inputArray.length === 0) {
    return ""
  }

  const inputPtr = ptr(inputArray)

  const outLenBuffer = new BigUint64Array(1)
  const outLenPtr = ptr(outLenBuffer)

  const resultPtr = lib.symbols.ptyToText(inputPtr, inputArray.length, cols, rows, outLenPtr)

  if (!resultPtr) {
    lib.symbols.freeArena()
    throw new Error("ptyToText returned null")
  }

  const outLen = Number(outLenBuffer[0])

  // Handle empty output
  if (outLen === 0) {
    lib.symbols.freeArena()
    return ""
  }

  const textBuffer = toArrayBuffer(resultPtr, 0, outLen)
  const text = new TextDecoder().decode(textBuffer)

  lib.symbols.freeArena()

  return text
}

export const StyleFlags = {
  BOLD: 1,
  ITALIC: 2,
  UNDERLINE: 4,
  STRIKETHROUGH: 8,
  INVERSE: 16,
  FAINT: 32,
} as const
