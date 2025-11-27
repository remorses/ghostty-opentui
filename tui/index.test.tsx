import { describe, expect, it } from "bun:test"
import { rgbToHex } from "@opentui/core"
import { ptyToJson, ptyToText, StyleFlags, type TerminalData, type TerminalSpan } from "./ffi"
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

