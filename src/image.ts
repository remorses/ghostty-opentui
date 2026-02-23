// Terminal-to-image rendering using takumi-rs.
// Converts TerminalData (from ghostty-opentui parser) into PNG/WebP/JPEG images.
// Uses JetBrains Mono Nerd font for monospace rendering with
// Symbols Nerd Font Mono as fallback for missing Unicode glyphs.

import { readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { writeFileSync } from "fs"
import type { TerminalData, TerminalLine, TerminalSpan } from "./ffi.js"
import { StyleFlags } from "./ffi.js"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

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
  /** Output format (default: "png") */
  format?: "webp" | "png" | "jpeg"
  /** Quality for lossy formats 0-100 (default: 90) */
  quality?: number
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
  /** Array of image buffers */
  images: Buffer[]
  /** Paths to temp files where images were saved */
  paths: string[]
  /** Total number of content lines */
  totalLines: number
  /** Number of images generated */
  imageCount: number
}

// ─────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────

const DEFAULT_THEME: ImageTheme = {
  background: "#1a1b26",
  text: "#c0caf5",
}

const DEFAULT_FONT_SIZE = 14
const DEFAULT_LINE_HEIGHT = 1.5
const DEFAULT_PADDING_X = 0
const DEFAULT_PADDING_Y = 0
const FALLBACK_SYMBOLS_FONT_NAME = "Symbols Nerd Font Mono"
/** Monospace character width as a fraction of font size.
 * JetBrains Mono has 600/1000 em-unit width, so 0.6 is accurate. */
const CHAR_WIDTH_FACTOR = 0.6

// ─────────────────────────────────────────────────────────────
// Cached Renderer Singleton
// ─────────────────────────────────────────────────────────────

let cachedRenderer: import("@takumi-rs/core").Renderer | null = null
let rendererInitPromise: Promise<import("@takumi-rs/core").Renderer> | null = null
let cachedFontPath: string | undefined = undefined

/**
 * Get or create a cached takumi Renderer with the font loaded.
 * Re-creates if fontPath changes from previous call.
 */
async function getRenderer(fontPath?: string): Promise<import("@takumi-rs/core").Renderer> {
  if (cachedRenderer && cachedFontPath === fontPath) {
    return cachedRenderer
  }

  // Font path changed, need new renderer
  if (cachedFontPath !== fontPath) {
    cachedRenderer = null
    rendererInitPromise = null
  }

  if (rendererInitPromise) {
    return rendererInitPromise
  }

  rendererInitPromise = (async () => {
    const { Renderer } = await import("@takumi-rs/core")
    const renderer = new Renderer()

    // Load primary font - use custom path or bundled JetBrains Mono Nerd
    const resolvedFontPath = fontPath ?? getBundledFontPath()
    const fontData = readFileSync(resolvedFontPath)
    await renderer.loadFont(new Uint8Array(fontData))

    // Load Unicode symbols fallback font to cover glyphs that JetBrains Mono
    // does not include (e.g. U+25FC ◼ used by heatmap cells).
    const fallbackFontData = readFileSync(getBundledFallbackFontPath())
    await renderer.loadFont({
      data: new Uint8Array(fallbackFontData),
      name: FALLBACK_SYMBOLS_FONT_NAME,
    })

    cachedFontPath = fontPath
    cachedRenderer = renderer
    return renderer
  })()

  return rendererInitPromise
}

/** Resolve path to the bundled JetBrains Mono Nerd TTF */
function getBundledFontPath(): string {
  // import.meta.dirname works in both bun and node ESM
  const dir = typeof __dirname !== "undefined" ? __dirname : import.meta.dirname
  return join(dir, "..", "public", "jetbrains-mono-nerd.ttf")
}

/** Resolve path to bundled fallback symbols font */
function getBundledFallbackFontPath(): string {
  const dir = typeof __dirname !== "undefined" ? __dirname : import.meta.dirname
  return join(dir, "..", "public", "symbols-nerd-font-mono-regular.ttf")
}

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

/** Check if a line is empty (no spans or only whitespace) */
function isLineEmpty(line: TerminalLine): boolean {
  if (line.spans.length === 0) return true
  return line.spans.every((span) => {
    const textEmpty = span.text.trim() === ""
    const noBg = span.bg === null
    const noInverse = (span.flags & StyleFlags.INVERSE) === 0
    // If text is empty, we must ensure there's no visual background
    return textEmpty && noBg && noInverse
  })
}

/** Trim empty lines from end of lines array */
function trimTrailingEmptyLines(lines: TerminalLine[]): TerminalLine[] {
  let end = lines.length
  while (end > 0 && isLineEmpty(lines[end - 1]!)) {
    end--
  }
  return lines.slice(0, end)
}

/**
 * Detect the dominant background color along the edges of the terminal content.
 * Samples: all spans on first/last line + first/last span of each line in between.
 * Returns the most common color, falling back to the provided default.
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
      // Sample all spans on first and last lines
      for (const span of spans) add(span.bg)
    } else {
      // Sample first and last span of middle lines
      add(spans[0]!.bg)
      if (spans.length > 1) add(spans[spans.length - 1]!.bg)
    }
  }

  // Return most frequent color
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
function calculateAutoWidth(
  cols: number,
  fontSize: number,
  paddingX: number,
): number {
  const charWidth = fontSize * CHAR_WIDTH_FACTOR
  return Math.ceil(cols * charWidth + paddingX * 2)
}

// ─────────────────────────────────────────────────────────────
// Node Conversion Functions
// ─────────────────────────────────────────────────────────────

/**
 * Convert a TerminalSpan to a fixed-width container holding a text node.
 * The container width is exactly span.width * charWidth, forcing a character
 * grid layout so columns align even if the font renders some glyphs
 * (box-drawing, block elements) at slightly different advance widths.
 */
function spanToNode(
  span: TerminalSpan,
  helpers: typeof import("@takumi-rs/helpers"),
  theme: ImageTheme,
  charWidth: number,
) {
  const { container, text } = helpers

  const textStyle: Record<string, string | number> = {
    display: "inline",
    flexShrink: 0,
  }

  let fg = span.fg
  let bg = span.bg

  // Handle INVERSE flag: swap fg and bg
  if (span.flags & StyleFlags.INVERSE) {
    const tmpFg = fg
    fg = bg ?? theme.text
    bg = tmpFg ?? theme.background
  }

  if (fg) {
    textStyle.color = fg
  }
  if (span.flags & StyleFlags.BOLD) {
    textStyle.fontWeight = "bold"
  }
  if (span.flags & StyleFlags.ITALIC) {
    textStyle.fontStyle = "italic"
  }
  if (span.flags & StyleFlags.FAINT) {
    textStyle.opacity = 0.5
  }

  // Wrap text in a fixed-width container to enforce grid alignment
  const containerStyle: Record<string, string | number> = {
    display: "flex",
    width: span.width * charWidth,
    height: "100%",
    overflow: "hidden",
    flexShrink: 0,
  }
  if (bg) {
    containerStyle.backgroundColor = bg
  }

  return container({
    style: containerStyle,
    children: [text(span.text, textStyle)],
  })
}

/**
 * Convert a TerminalLine to a takumi flex row container.
 * Each line is a fixed-height row with spans inside.
 */
function lineToContainerNode(
  line: TerminalLine,
  helpers: typeof import("@takumi-rs/helpers"),
  options: {
    backgroundColor: string
    textColor: string
    lineHeight: number
    fontSize: number
    charWidth: number
    theme: ImageTheme
    width?: number
  },
) {
  const { container, text } = helpers
  const { backgroundColor, lineHeight, fontSize, charWidth, theme, width } = options

  const lineHeightPx = Math.round(fontSize * lineHeight)

  // Convert spans to fixed-width grid cells
  let spanChildren = line.spans.map((span) => spanToNode(span, helpers, theme, charWidth))
  if (spanChildren.length === 0) {
    // Empty line: invisible character to maintain height
    spanChildren = [container({
      style: { display: "flex", width: 1, height: "100%", flexShrink: 0 },
      children: [text("m", { color: backgroundColor })],
    })]
  }

  // Get line background from last span (for things like diff coloring that
  // extends to end of line)
  const lastSpan = line.spans[line.spans.length - 1]
  let lineBackground = backgroundColor
  if (lastSpan?.bg) {
    // Respect inverse on last span too
    if (lastSpan.flags & StyleFlags.INVERSE) {
      lineBackground = lastSpan.fg ?? theme.background
    } else {
      lineBackground = lastSpan.bg
    }
  }

  // Spacer fills remaining width with line background
  const spacer = container({
    style: {
      flex: 1,
      flexShrink: 0,
      height: "100%",
      backgroundColor: lineBackground,
    },
    children: [],
  })

  return container({
    style: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
      width: width ?? "100%",
      height: lineHeightPx,
      backgroundColor: lineBackground,
      overflow: "hidden",
    },
    children: [...spanChildren, spacer],
  })
}

/**
 * Convert lines array to a takumi root node ready for rendering.
 */
function frameToRootNode(
  lines: TerminalLine[],
  helpers: typeof import("@takumi-rs/helpers"),
  options: RenderImageOptions & { imageWidth: number; imageHeight: number },
) {
  const { container } = helpers
  const {
    imageWidth,
    fontSize = DEFAULT_FONT_SIZE,
    lineHeight = DEFAULT_LINE_HEIGHT,
    paddingX = DEFAULT_PADDING_X,
    paddingY = DEFAULT_PADDING_Y,
    theme = DEFAULT_THEME,
    imageHeight,
  } = options

  const frameColor = options.frameColor
  const hasFrame = (paddingX > 0 || paddingY > 0) && frameColor && frameColor !== theme.background
  const contentWidth = imageWidth - paddingX * 2
  const charWidth = fontSize * CHAR_WIDTH_FACTOR

  const lineNodes = lines.map((line) =>
    lineToContainerNode(line, helpers, {
      backgroundColor: theme.background,
      textColor: theme.text,
      lineHeight,
      fontSize,
      charWidth,
      theme,
      width: contentWidth,
    }),
  )

  // When frameColor differs from background, wrap lines in an inner container
  // so the padding area shows frameColor while content shows theme.background.
  // flexGrow: 1 ensures the inner container fills the full content area even
  // when using a fixed height with fewer lines than the available space.
  const children = hasFrame
    ? [
        container({
          style: {
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            flexGrow: 1,
            gap: 0,
            backgroundColor: theme.background,
            overflow: "hidden",
          },
          children: lineNodes,
        }),
      ]
    : lineNodes

  return container({
    style: {
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      gap: 0,
      width: imageWidth,
      height: imageHeight,
      backgroundColor: hasFrame ? frameColor : theme.background,
      color: theme.text,
      fontFamily: `JetBrains Mono Nerd, ${FALLBACK_SYMBOLS_FONT_NAME}, monospace`,
      fontSize,
      whiteSpace: "pre",
      overflow: "hidden",
      paddingTop: paddingY,
      paddingBottom: paddingY,
      paddingLeft: paddingX,
      paddingRight: paddingX,
    },
    children,
  })
}

// ─────────────────────────────────────────────────────────────
// High-level Rendering Functions
// ─────────────────────────────────────────────────────────────

/**
 * Render TerminalData to a single image buffer.
 * Height and width are auto-calculated from content if not specified.
 */
export async function renderTerminalToImage(
  data: TerminalData,
  options: RenderImageOptions = {},
): Promise<Buffer> {
  const helpers = await import("@takumi-rs/helpers")
  const renderer = await getRenderer(options.fontPath)

  const {
    fontSize = DEFAULT_FONT_SIZE,
    lineHeight = DEFAULT_LINE_HEIGHT,
    paddingX = DEFAULT_PADDING_X,
    paddingY = DEFAULT_PADDING_Y,
    format = "png",
    quality = 90,
    height,
  } = options

  // Auto-calculate width from terminal columns
  const imageWidth = options.width ?? calculateAutoWidth(data.cols, fontSize, paddingX)

  // Trim empty lines
  const lines = trimTrailingEmptyLines(data.lines)
  if (lines.length === 0) {
    throw new Error("No content to render")
  }

  const lineHeightPx = Math.round(fontSize * lineHeight)

  // Calculate image height
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

  // Auto-detect frame color from edge cells when padding is set but no explicit frameColor
  const theme = options.theme ?? DEFAULT_THEME
  const resolvedFrameColor =
    options.frameColor ?? ((paddingX > 0 || paddingY > 0) ? detectEdgeColor(visibleLines, theme.background) : undefined)

  // Build node tree
  const rootNode = frameToRootNode(visibleLines, helpers, {
    ...options,
    frameColor: resolvedFrameColor,
    imageWidth,
    imageHeight,
  })

  // Render — multiply dimensions by devicePixelRatio so the output image
  // has more pixels while keeping the same layout. The renderer uses
  // width/height as the output canvas size, devicePixelRatio only affects
  // layout computation (CSS-like pixels), so we scale both.
  const dpr = options.devicePixelRatio ?? 1
  const imageBuffer = await renderer.render(rootNode, {
    width: Math.round(imageWidth * dpr),
    height: Math.round(imageHeight * dpr),
    format,
    quality,
    devicePixelRatio: dpr,
  })

  return Buffer.from(imageBuffer)
}

/**
 * Render TerminalData to multiple paginated images.
 * Splits content when exceeding maxLinesPerImage.
 * Saves images to temp directory and returns paths.
 */
export async function renderTerminalToPaginatedImages(
  data: TerminalData,
  options: RenderPaginatedOptions = {},
): Promise<PaginatedRenderResult> {
  const helpers = await import("@takumi-rs/helpers")
  const renderer = await getRenderer(options.fontPath)

  const {
    fontSize = DEFAULT_FONT_SIZE,
    lineHeight = DEFAULT_LINE_HEIGHT,
    paddingX = DEFAULT_PADDING_X,
    paddingY = DEFAULT_PADDING_Y,
    maxLinesPerImage = 70,
    format = "png",
    quality = 90,
  } = options

  const imageWidth = options.width ?? calculateAutoWidth(data.cols, fontSize, paddingX)

  // Trim empty lines
  const lines = trimTrailingEmptyLines(data.lines)
  if (lines.length === 0) {
    throw new Error("No content to render")
  }

  const lineHeightPx = Math.round(fontSize * lineHeight)

  // Auto-detect frame color from edge cells when padding is set but no explicit frameColor
  const theme = options.theme ?? DEFAULT_THEME
  const resolvedFrameColor =
    options.frameColor ?? ((paddingX > 0 || paddingY > 0) ? detectEdgeColor(lines, theme.background) : undefined)

  // Split into chunks
  const chunks: TerminalLine[][] = []
  for (let i = 0; i < lines.length; i += maxLinesPerImage) {
    chunks.push(lines.slice(i, i + maxLinesPerImage))
  }

  const images: Buffer[] = []
  const paths: string[] = []
  const timestamp = Date.now()

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]!
    const imageHeight = chunk.length * lineHeightPx + paddingY * 2

    const rootNode = frameToRootNode(chunk, helpers, {
      ...options,
      frameColor: resolvedFrameColor,
      imageWidth,
      imageHeight,
    })

    const dpr = options.devicePixelRatio ?? 1
    const imageBuffer = await renderer.render(rootNode, {
      width: Math.round(imageWidth * dpr),
      height: Math.round(imageHeight * dpr),
      format,
      quality,
      devicePixelRatio: dpr,
    })

    const buffer = Buffer.from(imageBuffer)
    images.push(buffer)

    const filename = `terminal-${timestamp}-${chunkIndex + 1}.${format}`
    const filepath = join(tmpdir(), filename)
    writeFileSync(filepath, buffer)
    paths.push(filepath)
  }

  return {
    images,
    paths,
    totalLines: lines.length,
    imageCount: chunks.length,
  }
}
