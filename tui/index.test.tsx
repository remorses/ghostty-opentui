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

describe("ls output tests", () => {
  it("should handle ls --color=always output without extra blank lines when using limit", () => {
    // Simulate ls --color=always -la output (5 lines)
    const lsOutput = 
      "total 224\n" +
      "drwxrwxr-x  27 user  staff   864 Nov 26 19:30 \x1b[34m.\x1b[0m\n" +
      "drwx------  71 user  staff  2272 Nov 26 19:44 \x1b[34m..\x1b[0m\n" +
      "-rw-r--r--   1 user  staff   109 Nov 26 18:15 .gitignore\n" +
      "-rw-r--r--   1 user  staff  1100 Nov 26 19:14 package.json"

    const actualLines = lsOutput.split("\n").length

    // Without limit: rows creates that many lines
    const withoutLimit = ptyToJson(lsOutput, { cols: 80, rows: 50 })
    expect(withoutLimit.lines.length).toBe(50) // Creates 50 lines (5 content + 45 blank)

    // With limit: only first N lines
    const withLimit = ptyToJson(lsOutput, { cols: 80, rows: 50, limit: actualLines })
    expect(withLimit.lines.length).toBe(actualLines) // Only 5 lines
  })

  it("should handle ls output with smaller rows to avoid blank lines", () => {
    const lsOutput = 
      "total 224\n" +
      "drwxrwxr-x  27 user  staff   864 Nov 26 19:30 \x1b[34m.\x1b[0m\n" +
      "drwx------  71 user  staff  2272 Nov 26 19:44 \x1b[34m..\x1b[0m"

    const actualLines = lsOutput.split("\n").length

    // Using rows close to actual content
    const result = ptyToJson(lsOutput, { cols: 80, rows: actualLines + 2 })
    expect(result.lines.length).toBeLessThanOrEqual(actualLines + 2)
  })

  it("should preserve ANSI colors in ls output", () => {
    const lsOutput = "drwxr-xr-x  3 user  staff  96 Nov 26 16:19 \x1b[34m.git\x1b[0m"
    const result = ptyToJson(lsOutput, { cols: 80, rows: 5 })

    const firstLine = result.lines[0]
    const coloredSpan = firstLine.spans.find(s => s.text === ".git")
    expect(coloredSpan).toBeDefined()
    expect(coloredSpan!.fg).toBeTruthy() // Should have blue color
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
