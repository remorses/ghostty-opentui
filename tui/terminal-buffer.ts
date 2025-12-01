import {
  TextBufferRenderable,
  type TextBufferOptions,
  StyledText,
  RGBA,
  type RenderContext,
  type TextChunk,
} from "@opentui/core"
import { ptyToJson, type TerminalData, type TerminalSpan, StyleFlags } from "./ffi"

const DEFAULT_FG = RGBA.fromHex("#d4d4d4")

/**
 * Defines a region to highlight in the terminal output.
 */
export interface HighlightRegion {
  /** Line number (0-based) */
  line: number
  /** Start column (0-based, inclusive) */
  start: number
  /** End column (0-based, exclusive) */
  end: number
  /** If true, replaces the highlighted text with 'x' characters (for testing) */
  replaceWithX?: boolean
  /** Background color for the highlight (hex string like "#ff0000") */
  backgroundColor: string
}

const TextAttributes = {
  BOLD: 1 << 0,
  DIM: 1 << 1,
  ITALIC: 1 << 2,
  UNDERLINE: 1 << 3,
  BLINK: 1 << 4,
  REVERSE: 1 << 5,
  HIDDEN: 1 << 6,
  STRIKETHROUGH: 1 << 7,
}

function convertSpanToChunk(span: TerminalSpan): TextChunk {
  const { text, fg, bg, flags } = span

  let fgColor = fg ? RGBA.fromHex(fg) : DEFAULT_FG
  let bgColor = bg ? RGBA.fromHex(bg) : undefined

  if (flags & StyleFlags.INVERSE) {
    const temp = fgColor
    fgColor = bgColor || DEFAULT_FG
    bgColor = temp
  }

  let attributes = 0
  if (flags & StyleFlags.BOLD) attributes |= TextAttributes.BOLD
  if (flags & StyleFlags.ITALIC) attributes |= TextAttributes.ITALIC
  if (flags & StyleFlags.UNDERLINE) attributes |= TextAttributes.UNDERLINE
  if (flags & StyleFlags.STRIKETHROUGH) attributes |= TextAttributes.STRIKETHROUGH
  if (flags & StyleFlags.FAINT) attributes |= TextAttributes.DIM

  return { __isChunk: true, text, fg: fgColor, bg: bgColor, attributes }
}

/**
 * Applies highlights to chunks for a specific line.
 * Splits chunks at highlight boundaries and applies background colors.
 */
export function applyHighlightsToLine(
  chunks: TextChunk[],
  highlights: HighlightRegion[],
): TextChunk[] {
  if (highlights.length === 0) return chunks

  const result: TextChunk[] = []
  let col = 0

  for (const chunk of chunks) {
    const chunkStart = col
    const chunkEnd = col + chunk.text.length

    // Find all highlights that overlap with this chunk
    const overlappingHighlights = highlights.filter(
      (hl) => hl.start < chunkEnd && hl.end > chunkStart
    )

    if (overlappingHighlights.length === 0) {
      // No highlights overlap this chunk
      result.push(chunk)
      col = chunkEnd
      continue
    }

    // Process the chunk with highlights
    let pos = 0
    const text = chunk.text

    // Sort highlights by start position
    const sortedHighlights = [...overlappingHighlights].sort((a, b) => a.start - b.start)

    for (const hl of sortedHighlights) {
      const hlStartInChunk = Math.max(0, hl.start - chunkStart)
      const hlEndInChunk = Math.min(text.length, hl.end - chunkStart)

      // Add text before highlight (if any)
      if (pos < hlStartInChunk) {
        result.push({
          __isChunk: true,
          text: text.slice(pos, hlStartInChunk),
          fg: chunk.fg,
          bg: chunk.bg,
          attributes: chunk.attributes,
        })
      }

      // Add highlighted text
      if (hlStartInChunk < hlEndInChunk) {
        const highlightedText = text.slice(hlStartInChunk, hlEndInChunk)
        const displayText = hl.replaceWithX ? "x".repeat(highlightedText.length) : highlightedText
        result.push({
          __isChunk: true,
          text: displayText,
          fg: chunk.fg,
          bg: RGBA.fromHex(hl.backgroundColor),
          attributes: chunk.attributes,
        })
      }

      pos = hlEndInChunk
    }

    // Add remaining text after last highlight
    if (pos < text.length) {
      result.push({
        __isChunk: true,
        text: text.slice(pos),
        fg: chunk.fg,
        bg: chunk.bg,
        attributes: chunk.attributes,
      })
    }

    col = chunkEnd
  }

  return result
}

export function terminalDataToStyledText(
  data: TerminalData,
  highlights?: HighlightRegion[],
): StyledText {
  const chunks: TextChunk[] = []

  // Group highlights by line for efficient lookup
  const highlightsByLine = new Map<number, HighlightRegion[]>()
  if (highlights) {
    for (const hl of highlights) {
      const lineHighlights = highlightsByLine.get(hl.line) ?? []
      lineHighlights.push(hl)
      highlightsByLine.set(hl.line, lineHighlights)
    }
  }

  for (let i = 0; i < data.lines.length; i++) {
    const line = data.lines[i]
    let lineChunks: TextChunk[] = []

    if (line.spans.length === 0) {
      lineChunks.push({ __isChunk: true, text: " ", attributes: 0 })
    } else {
      for (const span of line.spans) {
        lineChunks.push(convertSpanToChunk(span))
      }
    }

    // Apply highlights for this line
    const lineHighlights = highlightsByLine.get(i)
    if (lineHighlights) {
      lineChunks = applyHighlightsToLine(lineChunks, lineHighlights)
    }

    chunks.push(...lineChunks)

    if (i < data.lines.length - 1) {
      chunks.push({ __isChunk: true, text: "\n", attributes: 0 })
    }
  }

  return new StyledText(chunks)
}

export interface GhosttyTerminalOptions extends TextBufferOptions {
  ansi: string | Buffer
  cols?: number
  rows?: number
  limit?: number  // Maximum number of lines to render (from start)
  trimEnd?: boolean  // Remove empty lines from the end
  highlights?: HighlightRegion[]  // Regions to highlight with custom background colors
}

/** @deprecated Use GhosttyTerminalOptions instead */
export type TerminalBufferOptions = GhosttyTerminalOptions

export class GhosttyTerminalRenderable extends TextBufferRenderable {
  private _ansi: string | Buffer
  private _cols: number
  private _rows: number
  private _limit?: number
  private _trimEnd?: boolean
  private _highlights?: HighlightRegion[]
  private _ansiDirty: boolean = false
  private _lineCount: number = 0

  constructor(ctx: RenderContext, options: GhosttyTerminalOptions) {
    super(ctx, {
      ...options,
      fg: DEFAULT_FG,
      wrapMode: "none",
    })

    this._ansi = options.ansi
    this._cols = options.cols ?? 120
    this._rows = options.rows ?? 40
    this._limit = options.limit
    this._trimEnd = options.trimEnd
    this._highlights = options.highlights
    this._ansiDirty = true
  }

  /**
   * Returns the total number of lines in the terminal buffer (after limit and trimming)
   */
  get lineCount(): number {
    return this._lineCount
  }

  get limit(): number | undefined {
    return this._limit
  }

  set limit(value: number | undefined) {
    if (this._limit !== value) {
      this._limit = value
      this._ansiDirty = true
      this.requestRender()
    }
  }

  get trimEnd(): boolean | undefined {
    return this._trimEnd
  }

  set trimEnd(value: boolean | undefined) {
    if (this._trimEnd !== value) {
      this._trimEnd = value
      this._ansiDirty = true
      this.requestRender()
    }
  }

  get highlights(): HighlightRegion[] | undefined {
    return this._highlights
  }

  set highlights(value: HighlightRegion[] | undefined) {
    this._highlights = value
    this._ansiDirty = true
    this.requestRender()
  }

  get ansi(): string | Buffer {
    return this._ansi
  }

  set ansi(value: string | Buffer) {
    if (this._ansi !== value) {
      this._ansi = value
      this._ansiDirty = true
      this.requestRender()
    }
  }

  get cols(): number {
    return this._cols
  }

  set cols(value: number) {
    if (this._cols !== value) {
      this._cols = value
      this._ansiDirty = true
      this.requestRender()
    }
  }

  get rows(): number {
    return this._rows
  }

  set rows(value: number) {
    if (this._rows !== value) {
      this._rows = value
      this._ansiDirty = true
      this.requestRender()
    }
  }

  protected renderSelf(buffer: any): void {
    if (this._ansiDirty) {
      // Pass limit to ptyToJson - it limits at Zig level before JSON serialization (more efficient!)
      const data = ptyToJson(this._ansi, { 
        cols: this._cols, 
        rows: this._rows,
        limit: this._limit 
      })
      
      // Apply trimEnd: remove empty lines from the end
      if (this._trimEnd) {
        while (data.lines.length > 0) {
          const lastLine = data.lines[data.lines.length - 1]
          const hasText = lastLine.spans.some(span => span.text.trim().length > 0)
          if (hasText) break
          data.lines.pop()
        }
      }
      
      const styledText = terminalDataToStyledText(data, this._highlights)
      this.textBuffer.setStyledText(styledText)
      this.updateTextInfo()
      
      // Update line count based on actual rendered lines
      const lineInfo = this.textBufferView.logicalLineInfo
      this._lineCount = lineInfo.lineStarts.length
      
      this._ansiDirty = false
    }
    super.renderSelf(buffer)
  }

  /**
   * Maps an ANSI line number to the corresponding scrollTop position for a parent ScrollBox.
   * Uses the actual rendered Y position from the text buffer's line info, which accounts
   * for text wrapping and actual layout.
   * 
   * @param lineNumber - The line number (0-based) in the ANSI output
   * @returns The scrollTop value to pass to ScrollBox.scrollTo()
   * 
   * @example
   * ```tsx
   * const scrollPos = terminalBufferRef.current.getScrollPositionForLine(42)
   * scrollBoxRef.current.scrollTo(scrollPos)
   * ```
   */
  getScrollPositionForLine(lineNumber: number): number {
    // Clamp to valid range
    const clampedLine = Math.max(0, Math.min(lineNumber, this._lineCount - 1))
    
    // Get the line info which contains actual Y offsets for each line
    // This accounts for wrapping and actual text layout
    const lineInfo = this.textBufferView.logicalLineInfo
    const lineStarts = lineInfo.lineStarts
    
    // If we have line start info, use it; otherwise fall back to simple calculation
    let lineYOffset = clampedLine
    if (lineStarts && lineStarts.length > clampedLine) {
      lineYOffset = lineStarts[clampedLine]
    }
    
    // Return the absolute Y position: this renderable's Y + the line's offset within it
    return this.y + lineYOffset
  }
}

/** @deprecated Use GhosttyTerminalRenderable instead */
export const TerminalBufferRenderable = GhosttyTerminalRenderable
