// Terminal-to-image rendering through an SVG intermediate.
// Converts TerminalData into deterministic SVG, then rasterizes PNG output with resvg-wasm.

import fs from "fs"
import os from "os"
import path from "path"
import { initWasm, Resvg } from "@resvg/resvg-wasm"
import type { TerminalData, TerminalLine, TerminalSpan } from "./ffi.js"
import { StyleFlags } from "./ffi.js"

/** Theme colors for rendering */
export interface ImageTheme {
  /** Background color as hex string (e.g. "#1a1b26") */
  background: string
  /** Default text color as hex string (e.g. "#c0caf5") */
  text: string
}

/** Options for rendering a single image */
export interface RenderImageOptions {
  /** Image width in pixels. If not set, auto-calculated from terminal cols */
  width?: number
  /** Image height in pixels. If not set, auto-calculated from content */
  height?: number
  /** Font size in pixels (default: 14) */
  fontSize?: number
  /** Line height multiplier (default: 1.5) */
  lineHeight?: number
  /** Horizontal padding in pixels (default: 0) */
  paddingX?: number
  /** Vertical padding in pixels (default: 0) */
  paddingY?: number
  /** Theme colors (default: tokyo night) */
  theme?: ImageTheme
  /** Path to a custom TTF/OTF font file. If not set, uses bundled JetBrains Mono Nerd */
  fontPath?: string
  /** Device pixel ratio for HiDPI/retina rendering (default: 1) */
  devicePixelRatio?: number
  /** Color of the padding/frame area. Defaults to theme.background.
   * Only visible when paddingX or paddingY > 0. */
  frameColor?: string
}

/** Options for paginated rendering */
export interface RenderPaginatedOptions extends RenderImageOptions {
  /** Maximum lines per image before splitting (default: 70) */
  maxLinesPerImage?: number
}

/** Result from paginated render */
export interface PaginatedRenderResult {
  /** Array of PNG image buffers */
  images: Buffer[]
  /** Paths to temp files where images were saved */
  paths: string[]
  /** Total number of content lines */
  totalLines: number
  /** Number of images generated */
  imageCount: number
}

const DEFAULT_THEME: ImageTheme = {
  background: "#1a1b26",
  text: "#c0caf5",
}

const DEFAULT_FONT_SIZE = 14
const DEFAULT_LINE_HEIGHT = 1.5
const DEFAULT_PADDING_X = 0
const DEFAULT_PADDING_Y = 0
const DEFAULT_FONT_FAMILY = "JetBrainsMono Nerd Font"
const FALLBACK_SYMBOLS_FONT_FAMILY = "Symbols Nerd Font Mono"
/** Monospace character width as a fraction of font size.
 * JetBrains Mono has 600/1000 em-unit width, so 0.6 is accurate. */
const CHAR_WIDTH_FACTOR = 0.6

let wasmInitPromise: Promise<void> | undefined
let cachedFontPath: string | undefined
let cachedFontBuffers: Uint8Array[] | undefined

async function ensureResvgInitialized(): Promise<void> {
  wasmInitPromise ??= (async () => {
    const wasmUrl = new URL(import.meta.resolve("@resvg/resvg-wasm/index_bg.wasm"))
    await initWasm(fs.readFileSync(wasmUrl))
  })()

  return wasmInitPromise
}

function getFontBuffers(fontPath?: string): Uint8Array[] {
  if (cachedFontBuffers && cachedFontPath === fontPath) return cachedFontBuffers

  const resolvedFontPath = fontPath ?? getBundledFontPath()
  cachedFontBuffers = [
    new Uint8Array(fs.readFileSync(resolvedFontPath)),
    new Uint8Array(fs.readFileSync(getBundledFallbackFontPath())),
  ]
  cachedFontPath = fontPath

  return cachedFontBuffers
}

/** Resolve path to the bundled JetBrains Mono Nerd TTF */
function getBundledFontPath(): string {
  const override = process.env["GHOSTTY_OPENTUI_FONT_PATH"]
  if (override) return override
  const dir = typeof __dirname !== "undefined" ? __dirname : import.meta.dirname
  return path.join(dir, "..", "public", "jetbrains-mono-nerd.ttf")
}

/** Resolve path to bundled fallback symbols font */
function getBundledFallbackFontPath(): string {
  const override = process.env["GHOSTTY_OPENTUI_FALLBACK_FONT_PATH"]
  if (override) return override
  const dir = typeof __dirname !== "undefined" ? __dirname : import.meta.dirname
  return path.join(dir, "..", "public", "symbols-nerd-font-mono-regular.ttf")
}

/** Check if a line is empty (no spans or only whitespace) */
function isLineEmpty(line: TerminalLine): boolean {
  if (line.spans.length === 0) return true
  return line.spans.every((span) => {
    const textEmpty = span.text.trim() === ""
    const noBg = span.bg === null
    const noInverse = (span.flags & StyleFlags.INVERSE) === 0
    return textEmpty && noBg && noInverse
  })
}

/** Trim empty lines from end of lines array */
function trimTrailingEmptyLines(lines: TerminalLine[]): TerminalLine[] {
  let end = lines.length
  while (end > 0 && isLineEmpty(lines[end - 1]!)) end--
  return lines.slice(0, end)
}

/**
 * Detect the dominant background color along the edges of the terminal content.
 * Samples all spans on first/last line plus first/last span of each line in between.
 */
function detectEdgeColor(lines: TerminalLine[], fallback: string): string {
  const counts = new Map<string, number>()
  const add = (color: string | null) => {
    const c = color ?? fallback
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }

  for (let i = 0; i < lines.length; i++) {
    const spans = lines[i]!.spans
    if (spans.length === 0) {
      add(null)
      continue
    }
    if (i === 0 || i === lines.length - 1) {
      for (const span of spans) add(span.bg)
    } else {
      add(spans[0]!.bg)
      if (spans.length > 1) add(spans[spans.length - 1]!.bg)
    }
  }

  let best = fallback
  let bestCount = 0
  for (const [color, count] of counts) {
    if (count > bestCount) {
      best = color
      bestCount = count
    }
  }
  return best
}

/** Calculate auto width from terminal columns */
function calculateAutoWidth(options: { cols: number; fontSize: number; paddingX: number }): number {
  const { cols, fontSize, paddingX } = options
  const charWidth = fontSize * CHAR_WIDTH_FACTOR
  return Math.ceil(cols * charWidth + paddingX * 2)
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function resolveSpanColors(span: TerminalSpan, theme: ImageTheme): { fg: string; bg: string | null } {
  let fg = span.fg
  let bg = span.bg

  if (span.flags & StyleFlags.INVERSE) {
    const tmpFg = fg
    fg = bg ?? theme.text
    bg = tmpFg ?? theme.background
  }

  return { fg: fg ?? theme.text, bg }
}

function lineBackground(line: TerminalLine, theme: ImageTheme): string {
  const lastSpan = line.spans[line.spans.length - 1]
  if (!lastSpan) return theme.background
  if (lastSpan.flags & StyleFlags.INVERSE) return lastSpan.fg ?? theme.background
  return lastSpan.bg ?? theme.background
}

function spanStyle(span: TerminalSpan): string {
  const styles: string[] = []
  if (span.flags & StyleFlags.BOLD) styles.push(`font-weight="700"`)
  if (span.flags & StyleFlags.ITALIC) styles.push(`font-style="italic"`)
  if (span.flags & StyleFlags.FAINT) styles.push(`opacity="0.5"`)

  const decorations: string[] = []
  if (span.flags & StyleFlags.UNDERLINE) decorations.push("underline")
  if (span.flags & StyleFlags.STRIKETHROUGH) decorations.push("line-through")
  if (decorations.length > 0) styles.push(`text-decoration="${decorations.join(" ")}"`)

  return styles.length > 0 ? ` ${styles.join(" ")}` : ""
}

function renderSvgFrame(
  lines: TerminalLine[],
  options: RenderImageOptions & { imageWidth: number; imageHeight: number },
): string {
  const {
    imageWidth,
    imageHeight,
    fontSize = DEFAULT_FONT_SIZE,
    lineHeight = DEFAULT_LINE_HEIGHT,
    paddingX = DEFAULT_PADDING_X,
    paddingY = DEFAULT_PADDING_Y,
    theme = DEFAULT_THEME,
  } = options

  const charWidth = fontSize * CHAR_WIDTH_FACTOR
  const lineHeightPx = Math.round(fontSize * lineHeight)
  const contentWidth = imageWidth - paddingX * 2
  const frameColor = options.frameColor ?? theme.background
  const fontFamily = `${DEFAULT_FONT_FAMILY}, ${FALLBACK_SYMBOLS_FONT_FAMILY}, monospace`
  const textYAdjustment = (lineHeightPx - fontSize) / 2 + fontSize * 0.78
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">`,
    `<rect x="0" y="0" width="${imageWidth}" height="${imageHeight}" fill="${escapeXml(frameColor)}"/>`,
    `<rect x="${paddingX}" y="${paddingY}" width="${contentWidth}" height="${Math.max(0, imageHeight - paddingY * 2)}" fill="${escapeXml(theme.background)}"/>`,
  ]

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!
    const lineY = paddingY + lineIndex * lineHeightPx
    const bg = lineBackground(line, theme)
    parts.push(`<rect x="${paddingX}" y="${lineY}" width="${contentWidth}" height="${lineHeightPx}" fill="${escapeXml(bg)}"/>`)

    let x = paddingX
    for (const span of line.spans) {
      const spanWidth = span.width * charWidth
      const colors = resolveSpanColors(span, theme)
      if (colors.bg) {
        parts.push(`<rect x="${x}" y="${lineY}" width="${spanWidth}" height="${lineHeightPx}" fill="${escapeXml(colors.bg)}"/>`)
      }
      if (span.text.length > 0) {
        parts.push(
          `<text x="${x}" y="${lineY + textYAdjustment}" fill="${escapeXml(colors.fg)}" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" xml:space="preserve"${spanStyle(span)}>${escapeXml(span.text)}</text>`,
        )
      }
      x += spanWidth
    }
  }

  parts.push("</svg>")
  return parts.join("")
}

function prepareFrame(data: TerminalData, options: RenderImageOptions): { lines: TerminalLine[]; imageWidth: number; imageHeight: number; frameColor?: string } {
  const {
    fontSize = DEFAULT_FONT_SIZE,
    lineHeight = DEFAULT_LINE_HEIGHT,
    paddingX = DEFAULT_PADDING_X,
    paddingY = DEFAULT_PADDING_Y,
    height,
  } = options

  const imageWidth = options.width ?? calculateAutoWidth({ cols: data.cols, fontSize, paddingX })
  const lines = trimTrailingEmptyLines(data.lines)
  if (lines.length === 0) throw new Error("No content to render")

  const lineHeightPx = Math.round(fontSize * lineHeight)
  let visibleLines: TerminalLine[]
  let imageHeight: number

  if (height) {
    const availableHeight = height - paddingY * 2
    const maxLines = Math.floor(availableHeight / lineHeightPx)
    visibleLines = lines.slice(0, maxLines)
    imageHeight = height
  } else {
    visibleLines = lines
    imageHeight = lines.length * lineHeightPx + paddingY * 2
  }

  const theme = options.theme ?? DEFAULT_THEME
  const frameColor = options.frameColor ?? ((paddingX > 0 || paddingY > 0) ? detectEdgeColor(visibleLines, theme.background) : undefined)

  return { lines: visibleLines, imageWidth, imageHeight, frameColor }
}

/**
 * Render TerminalData to deterministic SVG.
 * Useful for debugging and for callers that want vector terminal output.
 */
export function renderTerminalToSvg(data: TerminalData, options: RenderImageOptions = {}): string {
  const frame = prepareFrame(data, options)
  return renderSvgFrame(frame.lines, {
    ...options,
    frameColor: frame.frameColor,
    imageWidth: frame.imageWidth,
    imageHeight: frame.imageHeight,
  })
}

/**
 * Render TerminalData to a PNG image buffer.
 * Height and width are auto-calculated from content if not specified.
 */
export async function renderTerminalToImage(data: TerminalData, options: RenderImageOptions = {}): Promise<Buffer> {
  await ensureResvgInitialized()

  const frame = prepareFrame(data, options)
  const svg = renderSvgFrame(frame.lines, {
    ...options,
    frameColor: frame.frameColor,
    imageWidth: frame.imageWidth,
    imageHeight: frame.imageHeight,
  })

  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: options.devicePixelRatio ?? 1 },
    font: {
      fontBuffers: getFontBuffers(options.fontPath),
      defaultFontFamily: DEFAULT_FONT_FAMILY,
      monospaceFamily: DEFAULT_FONT_FAMILY,
    },
  })

  return Buffer.from(resvg.render().asPng())
}

/**
 * Render TerminalData to multiple paginated PNG images.
 * Splits content when exceeding maxLinesPerImage.
 * Saves images to temp directory and returns paths.
 */
export async function renderTerminalToPaginatedImages(
  data: TerminalData,
  options: RenderPaginatedOptions = {},
): Promise<PaginatedRenderResult> {
  await ensureResvgInitialized()

  const {
    fontSize = DEFAULT_FONT_SIZE,
    lineHeight = DEFAULT_LINE_HEIGHT,
    paddingX = DEFAULT_PADDING_X,
    paddingY = DEFAULT_PADDING_Y,
    maxLinesPerImage = 70,
  } = options

  const imageWidth = options.width ?? calculateAutoWidth({ cols: data.cols, fontSize, paddingX })
  const lines = trimTrailingEmptyLines(data.lines)
  if (lines.length === 0) throw new Error("No content to render")

  const lineHeightPx = Math.round(fontSize * lineHeight)
  const theme = options.theme ?? DEFAULT_THEME
  const frameColor = options.frameColor ?? ((paddingX > 0 || paddingY > 0) ? detectEdgeColor(lines, theme.background) : undefined)
  const chunks: TerminalLine[][] = []
  for (let i = 0; i < lines.length; i += maxLinesPerImage) chunks.push(lines.slice(i, i + maxLinesPerImage))

  const images: Buffer[] = []
  const paths: string[] = []
  const timestamp = Date.now()
  const fontBuffers = getFontBuffers(options.fontPath)

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]!
    const imageHeight = chunk.length * lineHeightPx + paddingY * 2
    const svg = renderSvgFrame(chunk, {
      ...options,
      frameColor,
      imageWidth,
      imageHeight,
    })
    const resvg = new Resvg(svg, {
      fitTo: { mode: "zoom", value: options.devicePixelRatio ?? 1 },
      font: {
        fontBuffers,
        defaultFontFamily: DEFAULT_FONT_FAMILY,
        monospaceFamily: DEFAULT_FONT_FAMILY,
      },
    })
    const buffer = Buffer.from(resvg.render().asPng())
    images.push(buffer)

    const filepath = path.join(os.tmpdir(), `terminal-${timestamp}-${chunkIndex + 1}.png`)
    fs.writeFileSync(filepath, buffer)
    paths.push(filepath)
  }

  return {
    images,
    paths,
    totalLines: lines.length,
    imageCount: chunks.length,
  }
}
