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

export interface TerminalBufferOptions extends TextBufferOptions {
  input: string | Buffer
  cols?: number
  rows?: number
}

export class TerminalBufferRenderable extends TextBufferRenderable {
  private _input: string | Buffer
  private _cols: number
  private _rows: number
  private _data: TerminalData

  constructor(ctx: RenderContext, options: TerminalBufferOptions) {
    super(ctx, {
      ...options,
      fg: DEFAULT_FG,
      wrapMode: "none",
    })

    this._input = options.input
    this._cols = options.cols ?? 120
    this._rows = options.rows ?? 40
    this._data = ptyToJson(this._input, { cols: this._cols, rows: this._rows })
    this.updateContent()
  }

  get input(): string | Buffer {
    return this._input
  }

  set input(value: string | Buffer) {
    if (this._input !== value) {
      this._input = value
      this._data = ptyToJson(this._input, { cols: this._cols, rows: this._rows })
      this.updateContent()
    }
  }

  get cols(): number {
    return this._cols
  }

  set cols(value: number) {
    if (this._cols !== value) {
      this._cols = value
      this._data = ptyToJson(this._input, { cols: this._cols, rows: this._rows })
      this.updateContent()
    }
  }

  get rows(): number {
    return this._rows
  }

  set rows(value: number) {
    if (this._rows !== value) {
      this._rows = value
      this._data = ptyToJson(this._input, { cols: this._cols, rows: this._rows })
      this.updateContent()
    }
  }

  get data(): TerminalData {
    return this._data
  }

  private updateContent(): void {
    const styledText = terminalDataToStyledText(this._data)
    this.textBuffer.setStyledText(styledText)
    this.updateTextInfo()
  }
}
