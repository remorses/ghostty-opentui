import { test, expect, describe } from "bun:test"
import { RGBA, type TextChunk, rgbToHex } from "@opentui/core"
import { applyHighlightsToLine, terminalDataToStyledText, type HighlightRegion } from "./terminal-buffer.js"
import { ptyToJson } from "./ffi.js"

function toHex(rgba: RGBA | undefined): string | undefined {
  return rgba ? rgbToHex(rgba) : undefined
}

describe("applyHighlightsToLine", () => {
  const createChunk = (text: string, bg?: string): TextChunk => ({
    __isChunk: true,
    text,
    fg: RGBA.fromHex("#ffffff"),
    bg: bg ? RGBA.fromHex(bg) : undefined,
    attributes: 0,
  })

  test("should return unchanged chunks when no highlights", () => {
    const chunks = [createChunk("hello world")]
    const result = applyHighlightsToLine(chunks, [])
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe("hello world")
  })

  test("should highlight a portion of text", () => {
    const chunks = [createChunk("hello world")]
    const highlights: HighlightRegion[] = [
      { line: 0, start: 0, end: 5, backgroundColor: "#ff0000" },
    ]
    const result = applyHighlightsToLine(chunks, highlights)

    expect(result).toHaveLength(2)
    expect(result[0].text).toBe("hello")
    expect(toHex(result[0].bg)).toBe("#ff0000")
    expect(result[1].text).toBe(" world")
    expect(result[1].bg).toBeUndefined()
  })

  test("should highlight middle of text", () => {
    const chunks = [createChunk("hello world")]
    const highlights: HighlightRegion[] = [
      { line: 0, start: 6, end: 11, backgroundColor: "#00ff00" },
    ]
    const result = applyHighlightsToLine(chunks, highlights)

    expect(result).toHaveLength(2)
    expect(result[0].text).toBe("hello ")
    expect(result[0].bg).toBeUndefined()
    expect(result[1].text).toBe("world")
    expect(toHex(result[1].bg)).toBe("#00ff00")
  })

  test("should replace text with x when replaceWithX is true", () => {
    const chunks = [createChunk("hello world")]
    const highlights: HighlightRegion[] = [
      { line: 0, start: 0, end: 5, backgroundColor: "#ff0000", replaceWithX: true },
    ]
    const result = applyHighlightsToLine(chunks, highlights)

    expect(result).toHaveLength(2)
    expect(result[0].text).toBe("xxxxx")
    expect(toHex(result[0].bg)).toBe("#ff0000")
    expect(result[1].text).toBe(" world")
  })

  test("should handle multiple highlights in one line", () => {
    const chunks = [createChunk("hello beautiful world")]
    const highlights: HighlightRegion[] = [
      { line: 0, start: 0, end: 5, backgroundColor: "#ff0000" },
      { line: 0, start: 16, end: 21, backgroundColor: "#00ff00" },
    ]
    const result = applyHighlightsToLine(chunks, highlights)

    // "hello" (0-5) + " beautiful " (5-16) + "world" (16-21)
    expect(result).toHaveLength(3)
    expect(result[0].text).toBe("hello")
    expect(toHex(result[0].bg)).toBe("#ff0000")
    expect(result[1].text).toBe(" beautiful ")
    expect(result[1].bg).toBeUndefined()
    expect(result[2].text).toBe("world")
    expect(toHex(result[2].bg)).toBe("#00ff00")
  })

  test("should handle highlight across multiple chunks", () => {
    const chunks = [createChunk("hello"), createChunk(" "), createChunk("world")]
    const highlights: HighlightRegion[] = [
      { line: 0, start: 3, end: 8, backgroundColor: "#ff0000" },
    ]
    const result = applyHighlightsToLine(chunks, highlights)

    // "hel" + "lo" (highlighted) + " " (highlighted) + "wo" (highlighted) + "rld"
    const texts = result.map((c) => c.text)
    expect(texts.join("")).toBe("hello world")
    
    // Check that highlighted parts have the background
    const highlightedParts = result.filter((c) => toHex(c.bg) === "#ff0000")
    expect(highlightedParts.map((c) => c.text).join("")).toBe("lo wo")
  })

  test("should preserve original chunk background when not highlighted", () => {
    const chunks = [createChunk("hello world", "#0000ff")]
    const highlights: HighlightRegion[] = [
      { line: 0, start: 6, end: 11, backgroundColor: "#ff0000" },
    ]
    const result = applyHighlightsToLine(chunks, highlights)

    expect(result).toHaveLength(2)
    expect(result[0].text).toBe("hello ")
    expect(toHex(result[0].bg)).toBe("#0000ff")
    expect(result[1].text).toBe("world")
    expect(toHex(result[1].bg)).toBe("#ff0000")
  })
})

describe("terminalDataToStyledText with highlights", () => {
  test("should apply highlights to specific lines", () => {
    const ansi = "line one\nline two\nline three"
    const data = ptyToJson(ansi, { cols: 80, rows: 24 })
    const highlights: HighlightRegion[] = [
      { line: 1, start: 0, end: 4, backgroundColor: "#ff0000" },
    ]
    const styled = terminalDataToStyledText(data, highlights)

    // Find the chunk with "line" on the second line
    const lineChunk = styled.chunks.find(
      (c) => c.text === "line" && toHex(c.bg) === "#ff0000"
    )
    expect(lineChunk).toBeDefined()
  })

  test("should apply replaceWithX to highlighted text", () => {
    const ansi = "secret password here"
    const data = ptyToJson(ansi, { cols: 80, rows: 24 })
    const highlights: HighlightRegion[] = [
      { line: 0, start: 7, end: 15, backgroundColor: "#ff0000", replaceWithX: true },
    ]
    const styled = terminalDataToStyledText(data, highlights)

    // Find the masked chunk
    const maskedChunk = styled.chunks.find((c) => c.text === "xxxxxxxx")
    expect(maskedChunk).toBeDefined()
    expect(toHex(maskedChunk?.bg)).toBe("#ff0000")
  })

  test("should handle highlights on ANSI colored text", () => {
    // Green "hello" followed by normal " world"
    const ansi = "\x1b[32mhello\x1b[0m world"
    const data = ptyToJson(ansi, { cols: 80, rows: 24 })
    const highlights: HighlightRegion[] = [
      { line: 0, start: 0, end: 5, backgroundColor: "#ffff00" },
    ]
    const styled = terminalDataToStyledText(data, highlights)

    // The "hello" should have yellow background and green foreground
    const helloChunk = styled.chunks.find(
      (c) => c.text === "hello" && toHex(c.bg) === "#ffff00"
    )
    expect(helloChunk).toBeDefined()
  })

  test("should handle multiple highlights on different lines", () => {
    const ansi = "first line\nsecond line\nthird line"
    const data = ptyToJson(ansi, { cols: 80, rows: 24 })
    const highlights: HighlightRegion[] = [
      { line: 0, start: 0, end: 5, backgroundColor: "#ff0000" },
      { line: 2, start: 0, end: 5, backgroundColor: "#00ff00" },
    ]
    const styled = terminalDataToStyledText(data, highlights)

    // Should have "first" with red bg and "third" with green bg
    const firstChunk = styled.chunks.find(
      (c) => c.text === "first" && toHex(c.bg) === "#ff0000"
    )
    const thirdChunk = styled.chunks.find(
      (c) => c.text === "third" && toHex(c.bg) === "#00ff00"
    )
    expect(firstChunk).toBeDefined()
    expect(thirdChunk).toBeDefined()
  })

  test("should work with no highlights", () => {
    const ansi = "plain text"
    const data = ptyToJson(ansi, { cols: 80, rows: 24 })
    const styled = terminalDataToStyledText(data)

    expect(styled.chunks.length).toBeGreaterThan(0)
    expect(styled.chunks.map((c) => c.text).join("")).toContain("plain text")
  })
})
