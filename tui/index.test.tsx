import { describe, expect, it } from "bun:test"
import { ptyToJson, StyleFlags, type TerminalData, type TerminalSpan } from "./ffi"

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

