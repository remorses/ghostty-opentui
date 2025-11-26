import { describe, expect, it } from "bun:test"
import { createTestRenderer } from "@opentui/core"
import { extend } from "@opentui/react"
import { TerminalBufferRenderable } from "./terminal-buffer"

// Register the component
extend({ "terminal-buffer": TerminalBufferRenderable })

describe("TerminalBufferRenderable", () => {
  it("should render simple ANSI text", async () => {
    const ansi = "\x1b[32mHello\x1b[0m World"
    const renderer = createTestRenderer()

    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    const output = renderer.toString()
    expect(output).toContain("Hello")
    expect(output).toContain("World")
    expect(output).toMatchSnapshot()
  })

  it("should render colored text", async () => {
    const ansi = "\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m"
    const renderer = createTestRenderer()

    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    const output = renderer.toString()
    expect(output).toContain("Red")
    expect(output).toContain("Green")
    expect(output).toContain("Blue")
    expect(output).toMatchSnapshot()
  })

  it("should render multi-line ANSI", async () => {
    const ansi = "Line 1\nLine 2\nLine 3"
    const renderer = createTestRenderer()

    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    const output = renderer.toString()
    expect(output).toContain("Line 1")
    expect(output).toContain("Line 2")
    expect(output).toContain("Line 3")
    expect(output).toMatchSnapshot()
  })

  it("should update when ansi prop changes", async () => {
    const renderer = createTestRenderer()

    // Initial render
    renderer.render(<terminal-buffer ansi="First" cols={40} rows={10} />)
    await renderer.waitForRender()

    let output = renderer.toString()
    expect(output).toContain("First")

    // Update with new ANSI
    renderer.render(<terminal-buffer ansi="Second" cols={40} rows={10} />)
    await renderer.waitForRender()

    output = renderer.toString()
    expect(output).not.toContain("First")
    expect(output).toContain("Second")
    expect(output).toMatchSnapshot()
  })

  it("should handle prefix being added", async () => {
    const renderer = createTestRenderer()
    const original = "Original Text"

    // Initial render
    renderer.render(<terminal-buffer ansi={original} cols={40} rows={10} />)
    await renderer.waitForRender()

    let output = renderer.toString()
    expect(output).toContain("Original Text")

    // Add prefix
    const prefix = "\x1b[1;35m[PREFIX]\x1b[0m\n"
    const updated = prefix + original
    renderer.render(<terminal-buffer ansi={updated} cols={40} rows={10} />)
    await renderer.waitForRender()

    output = renderer.toString()
    expect(output).toContain("PREFIX")
    expect(output).toContain("Original Text")
    expect(output).toMatchSnapshot()
  })

  it("should handle multiple prefix additions", async () => {
    const renderer = createTestRenderer()
    let ansi = "Base Text"

    // Initial render
    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    // Add first prefix
    ansi = "\x1b[1;35m[PREFIX 1]\x1b[0m\n" + ansi
    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    let output = renderer.toString()
    expect(output).toContain("PREFIX 1")
    expect(output).toContain("Base Text")

    // Add second prefix
    ansi = "\x1b[1;35m[PREFIX 2]\x1b[0m\n" + ansi
    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    output = renderer.toString()
    expect(output).toContain("PREFIX 2")
    expect(output).toContain("PREFIX 1")
    expect(output).toContain("Base Text")
    expect(output).toMatchSnapshot()
  })

  it("should respect cols and rows options", async () => {
    const ansi = "Test"
    const renderer = createTestRenderer()

    renderer.render(<terminal-buffer ansi={ansi} cols={20} rows={5} />)
    await renderer.waitForRender()

    const output = renderer.toString()
    expect(output).toContain("Test")
    expect(output).toMatchSnapshot()
  })

  it("should handle bold and italic text", async () => {
    const ansi = "\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m \x1b[1;3mBoth\x1b[0m"
    const renderer = createTestRenderer()

    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    const output = renderer.toString()
    expect(output).toContain("Bold")
    expect(output).toContain("Italic")
    expect(output).toContain("Both")
    expect(output).toMatchSnapshot()
  })

  it("should handle RGB colors", async () => {
    const ansi = "\x1b[38;2;255;105;180mHot Pink\x1b[0m \x1b[38;2;0;255;127mSpring Green\x1b[0m"
    const renderer = createTestRenderer()

    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    const output = renderer.toString()
    expect(output).toContain("Hot Pink")
    expect(output).toContain("Spring Green")
    expect(output).toMatchSnapshot()
  })

  it("should handle empty ANSI", async () => {
    const renderer = createTestRenderer()

    renderer.render(<terminal-buffer ansi="" cols={40} rows={10} />)
    await renderer.waitForRender()

    const output = renderer.toString()
    expect(output).toMatchSnapshot()
  })

  it("should preserve newlines correctly", async () => {
    const ansi = "Line1\n\nLine3"
    const renderer = createTestRenderer()

    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    const output = renderer.toString()
    expect(output).toContain("Line1")
    expect(output).toContain("Line3")
    expect(output).toMatchSnapshot()
  })

  it("should handle background colors", async () => {
    const ansi = "\x1b[41m Red BG \x1b[0m \x1b[42m Green BG \x1b[0m"
    const renderer = createTestRenderer()

    renderer.render(<terminal-buffer ansi={ansi} cols={40} rows={10} />)
    await renderer.waitForRender()

    const output = renderer.toString()
    expect(output).toContain("Red BG")
    expect(output).toContain("Green BG")
    expect(output).toMatchSnapshot()
  })
})
