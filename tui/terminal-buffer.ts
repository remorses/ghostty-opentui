import {
  TextBufferRenderable,
  type TextBufferOptions,
  StyledText,
  RGBA,
  type RenderContext,
  type TextChunk,
} from "@opentui/core"
import { ptyToJson, PersistentTerminal, hasPersistentTerminalSupport, type TerminalData, type TerminalSpan, StyleFlags } from "./ffi"

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
  ansi?: string | Buffer
  cols?: number
  rows?: number
  limit?: number  // Maximum number of lines to render (from start)
  trimEnd?: boolean  // Remove empty lines from the end
  highlights?: HighlightRegion[]  // Regions to highlight with custom background colors
  /**
   * Enable persistent mode for streaming/interactive use cases.
   * When true, the terminal maintains state between feed() calls.
   * Much more efficient for streaming than updating the ansi prop repeatedly.
   */
  persistent?: boolean
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
  
  // Persistent terminal support
  private _persistent: boolean = false
  private _persistentTerminal: PersistentTerminal | null = null

  constructor(ctx: RenderContext, options: GhosttyTerminalOptions) {
    super(ctx, {
      ...options,
      fg: DEFAULT_FG,
      wrapMode: "none",
    })

    this._ansi = options.ansi ?? ""
    this._cols = options.cols ?? 120
    this._rows = options.rows ?? 40
    this._limit = options.limit
    this._trimEnd = options.trimEnd
    this._highlights = options.highlights
    this._persistent = options.persistent ?? false
    
    // Initialize persistent terminal if enabled
    if (this._persistent && hasPersistentTerminalSupport()) {
      this._persistentTerminal = new PersistentTerminal({
        cols: this._cols,
        rows: this._rows,
      })
      
      // Feed initial content if provided
      if (this._ansi && (typeof this._ansi === "string" ? this._ansi.length > 0 : this._ansi.length > 0)) {
        this._persistentTerminal.feed(this._ansi)
      }
    }
    
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
      
      // In persistent mode, setting ansi replaces all content
      // Note: For streaming, use feed() instead which appends
      if (this._persistentTerminal) {
        this._persistentTerminal.reset()
        if (value && (typeof value === "string" ? value.length > 0 : value.length > 0)) {
          this._persistentTerminal.feed(value)
        }
      }
      
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
      if (this._persistentTerminal) {
        this._persistentTerminal.resize(value, this._rows)
      }
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
      if (this._persistentTerminal) {
        this._persistentTerminal.resize(this._cols, value)
      }
      this._ansiDirty = true
      this.requestRender()
    }
  }

  /** Whether this terminal is in persistent mode */
  get persistent(): boolean {
    return this._persistent
  }

  /** Persistent mode cannot be changed after construction */
  set persistent(_value: boolean) {
    // No-op: persistent mode is set at construction time and cannot be changed
  }

  /**
   * Feed data to the terminal. Only works in persistent mode.
   * For stateless mode, update the `ansi` property instead.
   * 
   * @param data - ANSI data to feed to the terminal
   */
  feed(data: string | Buffer): void {
    if (!this._persistentTerminal) {
      throw new Error("feed() is only available in persistent mode. Set persistent=true in options.")
    }
    this._persistentTerminal.feed(data)
    this._ansiDirty = true
    this.requestRender()
  }

  /**
   * Reset the terminal to its initial state. Only works in persistent mode.
   */
  reset(): void {
    if (!this._persistentTerminal) {
      throw new Error("reset() is only available in persistent mode. Set persistent=true in options.")
    }
    this._persistentTerminal.reset()
    this._ansiDirty = true
    this.requestRender()
  }

  /**
   * Get the current cursor position. Only works in persistent mode.
   * @returns [x, y] cursor position
   */
  getCursor(): [number, number] {
    if (!this._persistentTerminal) {
      throw new Error("getCursor() is only available in persistent mode. Set persistent=true in options.")
    }
    return this._persistentTerminal.getCursor()
  }

  /**
   * Get plain text content of the terminal.
   */
  getText(): string {
    if (this._persistentTerminal) {
      return this._persistentTerminal.getText()
    }
    // For stateless mode, we'd need to parse the ANSI - not implemented yet
    throw new Error("getText() in stateless mode is not implemented. Use persistent=true.")
  }

  /**
   * Clean up resources. Called automatically when the component unmounts.
   */
  override destroy(): void {
    if (this._persistentTerminal) {
      this._persistentTerminal.destroy()
      this._persistentTerminal = null
    }
    super.destroy()
  }

  protected renderSelf(buffer: any): void {
    if (this._ansiDirty) {
      let data: TerminalData
      
      if (this._persistentTerminal) {
        // Use persistent terminal for efficient streaming
        data = this._persistentTerminal.getJson({
          limit: this._limit,
        })
      } else {
        // Stateless mode - create terminal each time
        data = ptyToJson(this._ansi, { 
          cols: this._cols, 
          rows: this._rows,
          limit: this._limit 
        })
      }
      
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
