import { dlopen, FFIType, ptr, read, suffix, toArrayBuffer } from "bun:ffi"
import path from "path"
import fs from "fs"
import os from "os"

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

  // Check embedded libraries first (for bun compile)
  const embedded = getEmbeddedLib()
  if (embedded && fs.existsSync(embedded)) {
    return embedded
  }

  // Check local development path (zig-out)
  const devPath = path.join(import.meta.dir, "..", "zig-out", "lib", libName)
  if (fs.existsSync(devPath)) {
    return devPath
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

const libPath = getLibPath()

const lib = dlopen(libPath, {
  ptyToJson: {
    args: [FFIType.ptr, FFIType.u64, FFIType.u16, FFIType.u16, FFIType.u64, FFIType.u64, FFIType.ptr],
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

export function ptyToJson(input: Buffer | Uint8Array | string, options: PtyToJsonOptions = {}): TerminalData {
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

export const StyleFlags = {
  BOLD: 1,
  ITALIC: 2,
  UNDERLINE: 4,
  STRIKETHROUGH: 8,
  INVERSE: 16,
  FAINT: 32,
} as const
