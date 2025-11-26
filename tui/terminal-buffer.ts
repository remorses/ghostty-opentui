import {
  TextBufferRenderable,
  type TextBufferOptions,
  StyledText,
  RGBA,
  type RenderContext,
  type TextChunk,
} from "@opentui/core"
import { extend } from "@opentui/react"
import { type TerminalData, type TerminalSpan, StyleFlags } from "./ffi"

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
  data: TerminalData
}

export class TerminalBufferRenderable extends TextBufferRenderable {
  private _data: TerminalData

  constructor(ctx: RenderContext, options: TerminalBufferOptions) {
    super(ctx, {
      ...options,
      fg: DEFAULT_FG,
      wrapMode: "none",
    })

    this._data = options.data
    this.updateContent()
  }

  get data(): TerminalData {
    return this._data
  }

  set data(value: TerminalData) {
    if (this._data !== value) {
      this._data = value
      this.updateContent()
    }
  }

  private updateContent(): void {
    const styledText = terminalDataToStyledText(this._data)
    this.textBuffer.setStyledText(styledText)
    this.updateTextInfo()
  }
}

// Register with React
declare module "@opentui/react" {
  interface OpenTUIComponents {
    "terminal-buffer": typeof TerminalBufferRenderable
  }
}

extend({ "terminal-buffer": TerminalBufferRenderable })

// Export to prevent tree-shaking of side-effect registration
