import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { rgbToHex } from "@opentui/core"
import { ptyToJson, ptyToText, StyleFlags, PersistentTerminal, hasPersistentTerminalSupport, type TerminalData, type TerminalSpan } from "./ffi"
import { terminalDataToStyledText, type HighlightRegion } from "./terminal-buffer"

describe("ptyToJson", () => {
  it("should parse simple ANSI text", () => {
    const input = "\x1b[32mgreen\x1b[0m normal"
    const result = ptyToJson(input, { cols: 80, rows: 24 })

    expect(result.cols).toBe(80)
    expect(result.rows).toBe(24)
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it("should parse bold text", () => {
    const input = "\x1b[1mbold\x1b[0m"
    const result = ptyToJson(input, { cols: 80, rows: 24 })

    const firstLine = result.lines[0]
    expect(firstLine.spans.length).toBeGreaterThan(0)
    const boldSpan = firstLine.spans.find((s) => s.text === "bold")
    expect(boldSpan).toBeDefined()
    expect(boldSpan!.flags & StyleFlags.BOLD).toBeTruthy()
  })

  it("should parse colored text", () => {
    const input = "\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m"
    const result = ptyToJson(input, { cols: 80, rows: 24 })

    const firstLine = result.lines[0]
    expect(firstLine.spans.length).toBeGreaterThan(0)

    const redSpan = firstLine.spans.find((s) => s.text === "red")
    expect(redSpan).toBeDefined()
    expect(redSpan!.fg).toBeTruthy()

    const greenSpan = firstLine.spans.find((s) => s.text === "green")
    expect(greenSpan).toBeDefined()
    expect(greenSpan!.fg).toBeTruthy()
  })

  it("should handle multiple style flags", () => {
    const input = "\x1b[1;3;4mstyles\x1b[0m"
    const result = ptyToJson(input, { cols: 80, rows: 24 })

    const firstLine = result.lines[0]
    const styledSpan = firstLine.spans.find((s) => s.text === "styles")
    expect(styledSpan).toBeDefined()
    expect(styledSpan!.flags & StyleFlags.BOLD).toBeTruthy()
    expect(styledSpan!.flags & StyleFlags.ITALIC).toBeTruthy()
    expect(styledSpan!.flags & StyleFlags.UNDERLINE).toBeTruthy()
  })

  it("should parse RGB colors", () => {
    const input = "\x1b[38;2;255;0;128mrgb\x1b[0m"
    const result = ptyToJson(input, { cols: 80, rows: 24 })

    const firstLine = result.lines[0]
    const rgbSpan = firstLine.spans.find((s) => s.text === "rgb")
    expect(rgbSpan).toBeDefined()
    expect(rgbSpan!.fg).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it("should track cursor position", () => {
    const input = "line1\nline2\nline3"
    const result = ptyToJson(input, { cols: 80, rows: 24 })

    expect(result.cursor).toBeDefined()
    expect(result.cursor.length).toBe(2)
  })

  it("should handle whitespace input", () => {
    const result = ptyToJson(" ", { cols: 80, rows: 24 })

    expect(result.cols).toBe(80)
    expect(result.rows).toBe(24)
    expect(result.totalLines).toBeGreaterThanOrEqual(0)
  })

  it("should respect cols/rows options", () => {
    const input = "test"
    const result = ptyToJson(input, { cols: 120, rows: 50 })

    expect(result.cols).toBe(120)
    expect(result.rows).toBe(50)
  })

  it("should handle limit parameter efficiently", () => {
    // Generate 1000 lines
    const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}`).join("\n")
    
    // With limit=10, should only get 10 lines
    const result = ptyToJson(lines, { cols: 80, rows: 1000, limit: 10 })
    expect(result.lines.length).toBe(10)
    
    // First line should be "Line 1"
    expect(result.lines[0].spans[0].text).toContain("Line 1")
    
    // 10th line should be "Line 10"
    expect(result.lines[9].spans[0].text).toContain("Line 10")
  })
})

describe("StyleFlags", () => {
  it("should have correct flag values", () => {
    expect(StyleFlags.BOLD).toBe(1)
    expect(StyleFlags.ITALIC).toBe(2)
    expect(StyleFlags.UNDERLINE).toBe(4)
    expect(StyleFlags.STRIKETHROUGH).toBe(8)
    expect(StyleFlags.INVERSE).toBe(16)
    expect(StyleFlags.FAINT).toBe(32)
  })
})

describe("terminalDataToStyledText highlights", () => {
  it("should apply highlight with replaceWithX", () => {
    const input = "hello world"
    const data = ptyToJson(input, { cols: 80, rows: 24 })
    const highlights: HighlightRegion[] = [
      { line: 0, start: 0, end: 5, backgroundColor: "#ff0000", replaceWithX: true },
    ]
    const styled = terminalDataToStyledText(data, highlights)
    
    // Should have "xxxxx" with red background
    const maskedChunk = styled.chunks.find((c) => c.text === "xxxxx")
    expect(maskedChunk).toBeDefined()
    expect(maskedChunk?.bg ? rgbToHex(maskedChunk.bg) : undefined).toBe("#ff0000")
  })

  it("should highlight without replacing text", () => {
    const input = "test string"
    const data = ptyToJson(input, { cols: 80, rows: 24 })
    const highlights: HighlightRegion[] = [
      { line: 0, start: 5, end: 11, backgroundColor: "#00ff00" },
    ]
    const styled = terminalDataToStyledText(data, highlights)
    
    // Should have "string" with green background
    const highlightedChunk = styled.chunks.find(
      (c) => c.text === "string" && c.bg && rgbToHex(c.bg) === "#00ff00"
    )
    expect(highlightedChunk).toBeDefined()
  })
})

describe("ptyToText", () => {
  it("should handle large output without truncation", () => {
    // Generate 1000 lines of colored output
    const lines = Array.from({ length: 1000 }, (_, i) => `\x1b[3${i % 8}mLine ${i + 1}\x1b[0m`).join("\n")
    const result = ptyToText(lines)
    const resultLines = result.split("\n")
    
    expect(resultLines.length).toBe(1000)
    expect(resultLines[0]).toBe("Line 1")
    expect(resultLines[999]).toBe("Line 1000")
  })

  it("should strip ANSI codes and return plain text", () => {
    const input = "\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m"
    const result = ptyToText(input)
    expect(result).toMatchInlineSnapshot(`"red green"`)
  })

  it("should handle bold and italic ANSI codes", () => {
    const input = "\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m"
    const result = ptyToText(input)
    expect(result).toMatchInlineSnapshot(`"Bold Italic"`)
  })

  it("should handle multiline input", () => {
    const input = "\x1b[31mLine 1\x1b[0m\n\x1b[32mLine 2\x1b[0m"
    const result = ptyToText(input)
    expect(result).toMatchInlineSnapshot(`
"Line 1
Line 2"
`)
  })

  it("should handle RGB color codes", () => {
    const input = "\x1b[38;2;255;0;128mRGB text\x1b[0m"
    const result = ptyToText(input)
    expect(result).toMatchInlineSnapshot(`"RGB text"`)
  })

  it("should handle plain text without ANSI codes", () => {
    const input = "Plain text without any ANSI codes"
    const result = ptyToText(input)
    expect(result).toMatchInlineSnapshot(`"Plain text without any ANSI codes"`)
  })

  it("should handle empty input", () => {
    const result = ptyToText("")
    expect(result).toMatchInlineSnapshot(`""`)
  })

  it("should handle complex nested ANSI codes", () => {
    const input = "\x1b[1;31;4mBold Red Underline\x1b[0m normal \x1b[32;3mGreen Italic\x1b[0m"
    const result = ptyToText(input)
    expect(result).toMatchInlineSnapshot(`"Bold Red Underline normal Green Italic"`)
  })
})

describe("PersistentTerminal", () => {
  let terminal: PersistentTerminal | null = null

  afterEach(() => {
    if (terminal && !terminal.destroyed) {
      terminal.destroy()
    }
    terminal = null
  })

  it("should have persistent terminal support", () => {
    expect(hasPersistentTerminalSupport()).toBe(true)
  })

  it("should create a terminal with default dimensions", () => {
    terminal = new PersistentTerminal()
    expect(terminal.cols).toBe(120)
    expect(terminal.rows).toBe(40)
    expect(terminal.destroyed).toBe(false)
  })

  it("should create a terminal with custom dimensions", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    expect(terminal.cols).toBe(80)
    expect(terminal.rows).toBe(24)
  })

  it("should feed data and get text output", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    terminal.feed("Hello World")
    
    const text = terminal.getText()
    expect(text).toContain("Hello World")
  })

  it("should feed data and get JSON output", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    terminal.feed("Hello World")
    
    const data = terminal.getJson()
    expect(data.cols).toBe(80)
    expect(data.rows).toBe(24)
    expect(data.lines.length).toBeGreaterThan(0)
    expect(data.lines[0].spans[0].text).toBe("Hello World")
  })

  it("should maintain state across multiple feeds", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    
    terminal.feed("Hello ")
    terminal.feed("World")
    terminal.feed("\n")
    terminal.feed("Line 2")
    
    const text = terminal.getText()
    expect(text).toContain("Hello World")
    expect(text).toContain("Line 2")
  })

  it("should track cursor position", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    terminal.feed("Hello")
    
    const cursor = terminal.getCursor()
    expect(cursor).toEqual([5, 0]) // x=5, y=0
  })

  it("should track cursor across newlines", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    terminal.feed("Line 1\nLine 2\nLine 3")
    
    const cursor = terminal.getCursor()
    expect(cursor[0]).toBe(6) // x = length of "Line 3"
    expect(cursor[1]).toBe(2) // y = 2 (0-indexed)
  })

  it("should handle ANSI colors in streamed data", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    
    terminal.feed("\x1b[32m") // Set green
    terminal.feed("Green Text")
    terminal.feed("\x1b[0m") // Reset
    
    const data = terminal.getJson()
    const greenSpan = data.lines[0].spans.find(s => s.text === "Green Text")
    expect(greenSpan).toBeDefined()
    expect(greenSpan!.fg).toBeTruthy() // Has a color
  })

  it("should reset terminal state", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    terminal.feed("Hello World\nLine 2")
    
    terminal.reset()
    
    const cursor = terminal.getCursor()
    expect(cursor).toEqual([0, 0])
    
    // After reset, feeding new data should start fresh
    terminal.feed("Fresh Start")
    const text = terminal.getText()
    expect(text).toContain("Fresh Start")
  })

  it("should resize terminal", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    terminal.feed("Hello World")
    
    terminal.resize(40, 10)
    
    expect(terminal.cols).toBe(40)
    expect(terminal.rows).toBe(10)
    
    const data = terminal.getJson()
    expect(data.cols).toBe(40)
    expect(data.rows).toBe(10)
  })

  it("should destroy terminal and prevent further operations", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    terminal.feed("Hello")
    
    terminal.destroy()
    expect(terminal.destroyed).toBe(true)
    
    // Should throw on further operations
    expect(() => terminal!.feed("World")).toThrow("Terminal has been destroyed")
    expect(() => terminal!.getText()).toThrow("Terminal has been destroyed")
    expect(() => terminal!.getJson()).toThrow("Terminal has been destroyed")
    expect(() => terminal!.getCursor()).toThrow("Terminal has been destroyed")
    expect(() => terminal!.resize(40, 10)).toThrow("Terminal has been destroyed")
    expect(() => terminal!.reset()).toThrow("Terminal has been destroyed")
  })

  it("should handle limit parameter in getJson", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 100 })
    
    // Feed 50 lines
    for (let i = 0; i < 50; i++) {
      terminal.feed(`Line ${i + 1}\n`)
    }
    
    // Get only first 10 lines
    const data = terminal.getJson({ limit: 10 })
    expect(data.lines.length).toBe(10)
    expect(data.lines[0].spans[0].text).toContain("Line 1")
    expect(data.lines[9].spans[0].text).toContain("Line 10")
  })

  it("should handle offset parameter in getJson", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 100 })
    
    // Feed 20 lines
    for (let i = 0; i < 20; i++) {
      terminal.feed(`Line ${i + 1}\n`)
    }
    
    // Get lines starting from offset 10, limit 5
    const data = terminal.getJson({ offset: 10, limit: 5 })
    expect(data.lines.length).toBe(5)
    expect(data.offset).toBe(10)
    expect(data.lines[0].spans[0].text).toContain("Line 11")
  })

  it("should handle Buffer input", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    
    const buffer = Buffer.from("Buffer Input")
    terminal.feed(buffer)
    
    const text = terminal.getText()
    expect(text).toContain("Buffer Input")
  })

  it("should handle Uint8Array input", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    
    const encoder = new TextEncoder()
    const uint8 = encoder.encode("Uint8Array Input")
    terminal.feed(uint8)
    
    const text = terminal.getText()
    expect(text).toContain("Uint8Array Input")
  })

  it("should handle cursor movement escape sequences", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 24 })
    
    // Move cursor to position 5,5 (1-indexed in ANSI)
    terminal.feed("\x1b[6;6H")
    terminal.feed("X")
    
    const cursor = terminal.getCursor()
    expect(cursor).toEqual([6, 5]) // x=6 (after writing X), y=5
  })

  it("should handle multiple terminals independently", () => {
    const term1 = new PersistentTerminal({ cols: 80, rows: 24 })
    const term2 = new PersistentTerminal({ cols: 80, rows: 24 })
    
    try {
      term1.feed("Terminal 1")
      term2.feed("Terminal 2")
      
      expect(term1.getText()).toContain("Terminal 1")
      expect(term1.getText()).not.toContain("Terminal 2")
      
      expect(term2.getText()).toContain("Terminal 2")
      expect(term2.getText()).not.toContain("Terminal 1")
    } finally {
      term1.destroy()
      term2.destroy()
    }
  })

  it("should be more efficient than stateless ptyToJson for streaming", () => {
    terminal = new PersistentTerminal({ cols: 80, rows: 100 })
    
    // Simulate streaming data in chunks
    const chunks = [
      "\x1b[32mStarting build...\x1b[0m\n",
      "Compiling src/index.ts\n",
      "Compiling src/utils.ts\n",
      "\x1b[33mWarning: unused variable\x1b[0m\n",
      "\x1b[32mBuild complete!\x1b[0m\n",
    ]
    
    // Feed chunks one by one (like streaming PTY output)
    for (const chunk of chunks) {
      terminal.feed(chunk)
    }
    
    // Use limit to get just the content lines
    const data = terminal.getJson({ limit: 5 })
    expect(data.lines.length).toBe(5)
    
    // Verify all content is there
    const text = terminal.getText()
    expect(text).toContain("Starting build")
    expect(text).toContain("Build complete")
  })
})

