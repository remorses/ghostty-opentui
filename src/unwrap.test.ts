import { test, expect, describe } from "bun:test"
import { PersistentTerminal, ptyToJson, ptyToText } from "./ffi.js"

describe("getText() soft-wrap unwrapping", () => {
  test("unwraps soft-wrapped lines in persistent terminal", () => {
    const term = new PersistentTerminal({ cols: 10, rows: 24 })
    // Feed a 25-char line that will soft-wrap at col 10
    term.feed("AAAAAAAAAA" + "BBBBBBBBBB" + "CCCCC\n" + "second")
    const text = term.getText()
    const lines = text.split("\n").filter(Boolean)
    expect(lines.length).toBe(2)
    expect(lines[0]).toBe("AAAAAAAAAABBBBBBBBBBCCCCC")
    expect(lines[1]).toBe("second")
    term.destroy()
  })

  test("preserves hard newlines", () => {
    const term = new PersistentTerminal({ cols: 80, rows: 24 })
    term.feed("line1\nline2\nline3")
    const text = term.getText()
    const lines = text.split("\n").filter(Boolean)
    expect(lines).toEqual(["line1", "line2", "line3"])
    term.destroy()
  })
})

describe("ptyToText() soft-wrap unwrapping", () => {
  test("unwraps soft-wrapped lines", () => {
    const text = ptyToText("AAAAAAAAAA" + "BBBBBBBBBB" + "CCCCC\nsecond", { cols: 10, rows: 24 })
    const lines = text.split("\n").filter(Boolean)
    expect(lines.length).toBe(2)
    expect(lines[0]).toBe("AAAAAAAAAABBBBBBBBBBCCCCC")
    expect(lines[1]).toBe("second")
  })
})

describe("getJson() wrappedLines", () => {
  test("includes wrappedLines array in JSON output", () => {
    const term = new PersistentTerminal({ cols: 10, rows: 24 })
    term.feed("AAAAAAAAAA" + "BBBBBBBBBB" + "CCCCC\n" + "end")
    const data = term.getJson()
    expect(data.wrappedLines).toBeDefined()
    // First two rows are soft-wrapped, then a hard break, then content
    expect(data.wrappedLines![0]).toBe(true)
    expect(data.wrappedLines![1]).toBe(true)
    expect(data.wrappedLines![2]).toBe(false) // hard newline row
    expect(data.wrappedLines![3]).toBe(false) // "end" row
    term.destroy()
  })

  test("wrappedLines in stateless ptyToJson", () => {
    const data = ptyToJson("AAAAAAAAAA" + "BBBBBBBBBB" + "CCCCC\nend", { cols: 10, rows: 24 })
    expect(data.wrappedLines).toBeDefined()
    expect(data.wrappedLines![0]).toBe(true)
    expect(data.wrappedLines![1]).toBe(true)
    expect(data.wrappedLines![2]).toBe(false)
  })
})
