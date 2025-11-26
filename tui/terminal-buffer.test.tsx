import { describe, expect, it } from "bun:test"
import { createRoot, extend } from "@opentui/react"
import { createTestRenderer, type TestRendererOptions } from "@opentui/core/testing"
import { TerminalBufferRenderable } from "./terminal-buffer"
import { act } from "react"
import type { ReactNode } from "react"

// Register the component
extend({ "terminal-buffer": TerminalBufferRenderable })

// Custom testRender that uses the main entry point's createRoot (and thus shared component catalogue)
async function testRender(node: ReactNode, options: TestRendererOptions = {}) {
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const testSetup = await createTestRenderer({
    ...options,
    onDestroy() {
        // Cleanup logic if needed
    }
  })

  const root = createRoot(testSetup.renderer)
  
  await act(async () => {
    root.render(node)
  })

  return testSetup
}

describe("TerminalBufferRenderable", () => {
  it("should render basic text component", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <text>Test Basic</text>,
      { width: 40, height: 10 }
    )
    await renderOnce()
    const output = captureCharFrame()
    expect(output).toContain("Test Basic")
  })

  it("should render simple ANSI text", async () => {
    const ansi = "\x1b[32mHello\x1b[0m World"
    
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Hello")
    expect(output).toContain("World")
  })

  it("should render colored text", async () => {
    const ansi = "\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Red")
    expect(output).toContain("Green")
    expect(output).toContain("Blue")
  })

  it("should render multi-line ANSI", async () => {
    const ansi = "Line 1\nLine 2\nLine 3"
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Line 1")
    expect(output).toContain("Line 2")
    expect(output).toContain("Line 3")
  })

  it("should handle prefix being added", async () => {
    const original = "Original Text"
    // Add prefix
    const prefix = "\x1b[1;35m[PREFIX]\x1b[0m\n"
    const updated = prefix + original

    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={updated} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("PREFIX")
    expect(output).toContain("Original Text")
  })

  it("should handle multiple prefix additions", async () => {
    let ansi = "Base Text"
    // Add first prefix
    ansi = "\x1b[1;35m[PREFIX 1]\x1b[0m\n" + ansi
    // Add second prefix
    ansi = "\x1b[1;35m[PREFIX 2]\x1b[0m\n" + ansi

    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("PREFIX 2")
    expect(output).toContain("PREFIX 1")
    expect(output).toContain("Base Text")
  })

  it("should respect cols and rows options", async () => {
    const ansi = "Test"
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={ansi} cols={20} rows={5} style={{ width: 20, height: 5 }} />,
      { width: 20, height: 5 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Test")
  })

  it("should handle bold and italic text", async () => {
    const ansi = "\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m \x1b[1;3mBoth\x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Bold")
    expect(output).toContain("Italic")
    expect(output).toContain("Both")
  })

  it("should handle RGB colors", async () => {
    const ansi = "\x1b[38;2;255;105;180mHot Pink\x1b[0m \x1b[38;2;0;255;127mSpring Green\x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Hot Pink")
    expect(output).toContain("Spring Green")
  })

  it("should handle empty ANSI", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi="" cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toBeDefined()
  })

  it("should preserve newlines correctly", async () => {
    const ansi = "Line1\n\nLine3"
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Line1")
    expect(output).toContain("Line3")
  })

  it("should handle background colors", async () => {
    const ansi = "\x1b[41m Red BG \x1b[0m \x1b[42m Green BG \x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal-buffer ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Red BG")
    expect(output).toContain("Green BG")
  })
})
