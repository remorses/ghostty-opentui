import {
  TextBufferRenderable,
  type TextBufferOptions,
  StyledText,
  RGBA,
  type RenderContext,
  type TextChunk,
} from "@opentui/core"
import { ptyToJson, PersistentTerminal, hasPersistentTerminalSupport, type TerminalData, type TerminalSpan, StyleFlags } from "./ffi.js"

const DEFAULT_FG = RGBA.fromHex("#d4d4d4")

const TextAttributes = {
  BOLD: 1 << 0,
  DIM: 1 << 1,
  ITALIC: 1 << 2,
  UNDERLINE: 1 << 3,
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

export function terminalDataToStyledText(data: TerminalData): StyledText {
  const chunks: TextChunk[] = []

  for (let i = 0; i < data.lines.length; i++) {
    const line = data.lines[i]

    if (line.spans.length === 0) {
      chunks.push({ __isChunk: true, text: " ", attributes: 0 })
    } else {
      for (const span of line.spans) {
        chunks.push(convertSpanToChunk(span))
      }
    }

    if (i < data.lines.length - 1) {
      chunks.push({ __isChunk: true, text: "\n", attributes: 0 })
    }
  }

  return new StyledText(chunks)
}

function trimEmptyLines(data: TerminalData): void {
  while (data.lines.length > 0) {
    const lastLine = data.lines[data.lines.length - 1]
    const hasText = lastLine.spans.some(span => span.text.trim().length > 0)
    if (hasText) break
    data.lines.pop()
  }
}

// =============================================================================
// StatelessTerminalRenderable
// =============================================================================

export interface StatelessTerminalOptions extends TextBufferOptions {
  ansi?: string | Buffer
  cols?: number
  rows?: number
  /** Max lines to render. Uses fast early-exit parsing - O(limit) not O(total). */
  limit?: number
  trimEnd?: boolean
}

/**
 * Stateless terminal for displaying static ANSI content.
 * The `limit` prop enables fast early-exit parsing.
 */
export class StatelessTerminalRenderable extends TextBufferRenderable {
  private _ansi: string | Buffer
  private _cols: number
  private _rows: number
  private _limit?: number
  private _trimEnd?: boolean
  private _needsUpdate: boolean = true
  private _lineCount: number = 0

  constructor(ctx: RenderContext, options: StatelessTerminalOptions) {
    super(ctx, { ...options, fg: DEFAULT_FG, wrapMode: "none" })
    this._ansi = options.ansi ?? ""
    this._cols = options.cols ?? 120
    this._rows = options.rows ?? 40
    this._limit = options.limit
    this._trimEnd = options.trimEnd
  }

  get lineCount(): number {
    return this._lineCount
  }

  get ansi(): string | Buffer {
    return this._ansi
  }

  set ansi(value: string | Buffer) {
    if (this._ansi !== value) {
      this._ansi = value
      this._needsUpdate = true
      this.requestRender()
    }
  }

  get cols(): number {
    return this._cols
  }

  set cols(value: number) {
    if (this._cols !== value) {
      this._cols = value
      this._needsUpdate = true
      this.requestRender()
    }
  }

  get rows(): number {
    return this._rows
  }

  set rows(value: number) {
    if (this._rows !== value) {
      this._rows = value
      this._needsUpdate = true
      this.requestRender()
    }
  }

  get limit(): number | undefined {
    return this._limit
  }

  set limit(value: number | undefined) {
    if (this._limit !== value) {
      this._limit = value
      this._needsUpdate = true
      this.requestRender()
    }
  }

  get trimEnd(): boolean | undefined {
    return this._trimEnd
  }

  set trimEnd(value: boolean | undefined) {
    if (this._trimEnd !== value) {
      this._trimEnd = value
      this._needsUpdate = true
      this.requestRender()
    }
  }

  protected renderSelf(buffer: any): void {
    if (this._needsUpdate) {
      const data = ptyToJson(this._ansi, {
        cols: this._cols,
        rows: this._rows,
        limit: this._limit,
      })

      if (this._trimEnd) trimEmptyLines(data)

      this.textBuffer.setStyledText(terminalDataToStyledText(data))
      this.updateTextInfo()
      this._lineCount = this.textBufferView.logicalLineInfo.lineStarts.length
      this._needsUpdate = false
    }
    super.renderSelf(buffer)
  }

  getScrollPositionForLine(lineNumber: number): number {
    const clampedLine = Math.max(0, Math.min(lineNumber, this._lineCount - 1))
    const lineStarts = this.textBufferView.logicalLineInfo.lineStarts
    const lineYOffset = lineStarts?.[clampedLine] ?? clampedLine
    return this.y + lineYOffset
  }
}

// =============================================================================
// TerminalRenderable
// =============================================================================

export interface TerminalOptions extends TextBufferOptions {
  ansi?: string | Buffer
  cols?: number
  rows?: number
  trimEnd?: boolean
}

/**
 * Persistent terminal for streaming/interactive use.
 * Each feed() call is O(chunk_size), not O(total_content).
 */
export class TerminalRenderable extends TextBufferRenderable {
  private _cols: number
  private _rows: number
  private _trimEnd?: boolean
  private _contentDirty: boolean = true
  private _lineCount: number = 0
  private _terminal: PersistentTerminal

  constructor(ctx: RenderContext, options: TerminalOptions) {
    super(ctx, { ...options, fg: DEFAULT_FG, wrapMode: "none" })

    if (!hasPersistentTerminalSupport()) {
      throw new Error("TerminalRenderable requires native support")
    }

    this._cols = options.cols ?? 120
    this._rows = options.rows ?? 40
    this._trimEnd = options.trimEnd

    this._terminal = new PersistentTerminal({ cols: this._cols, rows: this._rows })

    const ansi = options.ansi
    if (ansi && (typeof ansi === "string" ? ansi.length > 0 : ansi.length > 0)) {
      this._terminal.feed(ansi)
    }
  }

  get lineCount(): number {
    return this._lineCount
  }

  get cols(): number {
    return this._cols
  }

  set cols(value: number) {
    if (this._cols !== value) {
      this._cols = value
      this._terminal.resize(value, this._rows)
      this._contentDirty = true
      this.requestRender()
    }
  }

  get rows(): number {
    return this._rows
  }

  set rows(value: number) {
    if (this._rows !== value) {
      this._rows = value
      this._terminal.resize(this._cols, value)
      this._contentDirty = true
      this.requestRender()
    }
  }

  get trimEnd(): boolean | undefined {
    return this._trimEnd
  }

  set trimEnd(value: boolean | undefined) {
    if (this._trimEnd !== value) {
      this._trimEnd = value
      this._contentDirty = true
      this.requestRender()
    }
  }

  feed(data: string | Buffer): void {
    this._terminal.feed(data)
    this._contentDirty = true
    this.requestRender()
  }

  reset(): void {
    this._terminal.reset()
    this._contentDirty = true
    this.requestRender()
  }

  getCursor(): [number, number] {
    return this._terminal.getCursor()
  }

  getText(): string {
    return this._terminal.getText()
  }

  isReady(): boolean {
    return this._terminal.isReady()
  }

  override destroy(): void {
    this._terminal.destroy()
    super.destroy()
  }

  protected renderSelf(buffer: any): void {
    if (this._contentDirty) {
      const data = this._terminal.getJson({})

      if (this._trimEnd) trimEmptyLines(data)

      this.textBuffer.setStyledText(terminalDataToStyledText(data))
      this.updateTextInfo()
      this._lineCount = this.textBufferView.logicalLineInfo.lineStarts.length
      this._contentDirty = false
    }
    super.renderSelf(buffer)
  }

  getScrollPositionForLine(lineNumber: number): number {
    const clampedLine = Math.max(0, Math.min(lineNumber, this._lineCount - 1))
    const lineStarts = this.textBufferView.logicalLineInfo.lineStarts
    const lineYOffset = lineStarts?.[clampedLine] ?? clampedLine
    return this.y + lineYOffset
  }
}
