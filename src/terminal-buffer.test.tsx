import { describe, expect, it, afterEach } from "bun:test"
import { createRoot, extend } from "@opentui/react"
import { createTestRenderer, type TestRendererOptions } from "@opentui/core/testing"
import { StatelessTerminalRenderable, TerminalRenderable } from "./terminal-buffer"
import { act } from "react"
import type { ReactNode } from "react"

extend({
  "stateless-terminal": StatelessTerminalRenderable,
  "terminal": TerminalRenderable,
})

let currentTestSetup: Awaited<ReturnType<typeof createTestRenderer>> | null = null

afterEach(() => {
  if (currentTestSetup) {
    currentTestSetup.renderer.destroy()
    currentTestSetup = null
  }
})

async function testRender(node: ReactNode, options: TestRendererOptions = {}) {
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const testSetup = await createTestRenderer(options)
  currentTestSetup = testSetup
  const root = createRoot(testSetup.renderer)
  await act(async () => {
    root.render(node)
  })
  return testSetup
}

describe("StatelessTerminalRenderable", () => {
  it("should render simple ANSI text", async () => {
    const ansi = "\x1b[32mHello\x1b[0m World"
    const { renderOnce, captureCharFrame } = await testRender(
      <stateless-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
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
      <stateless-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
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
      <stateless-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()
    const output = captureCharFrame()
    expect(output).toContain("Line 1")
    expect(output).toContain("Line 2")
    expect(output).toContain("Line 3")
  })

  it("should handle bold text", async () => {
    const ansi = "\x1b[1mBold Text\x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <stateless-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Bold Text")
  })

  it("should handle inverse text", async () => {
    const ansi = "\x1b[7mInverse\x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <stateless-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Inverse")
  })

  describe("limit", () => {
    it("should limit output to specified number of lines", async () => {
      const ansi = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5"
      const { renderOnce, captureCharFrame } = await testRender(
        <stateless-terminal ansi={ansi} cols={40} rows={10} limit={2} style={{ width: 40, height: 10 }} />,
        { width: 40, height: 10 }
      )
      await renderOnce()
      const output = captureCharFrame()
      expect(output).toContain("Line 1")
      expect(output).toContain("Line 2")
      expect(output).not.toContain("Line 3")
    })

    it("should handle limit=1", async () => {
      const ansi = "First\nSecond\nThird"
      const { renderOnce, captureCharFrame } = await testRender(
        <stateless-terminal ansi={ansi} cols={40} rows={10} limit={1} style={{ width: 40, height: 10 }} />,
        { width: 40, height: 10 }
      )
      await renderOnce()
      const output = captureCharFrame()
      expect(output).toContain("First")
      expect(output).not.toContain("Second")
    })
  })

  describe("trimEnd", () => {
    it("should remove trailing empty lines when trimEnd is true", async () => {
      const ansi = "Content\n\n\n"
      const { renderOnce, captureCharFrame } = await testRender(
        <stateless-terminal ansi={ansi} cols={40} rows={10} trimEnd style={{ width: 40, height: 10 }} />,
        { width: 40, height: 10 }
      )
      await renderOnce()
      const output = captureCharFrame()
      expect(output).toContain("Content")
    })
  })
})

describe("TerminalRenderable", () => {
  it("should render with initial ansi content", async () => {
    const ansi = "\x1b[32mHello\x1b[0m World"
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()
    const output = captureCharFrame()
    expect(output).toContain("Hello")
    expect(output).toContain("World")
  })

  it("should allow feeding data", async () => {
    const ref = { current: null as TerminalRenderable | null }
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal
        ref={(r: TerminalRenderable) => { ref.current = r }}
        cols={40}
        rows={10}
        style={{ width: 40, height: 10 }}
      />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    ref.current?.feed("Hello ")
    ref.current?.feed("World")
    await renderOnce()

    expect(captureCharFrame()).toContain("Hello World")
  })

  it("should support streaming data", async () => {
    const ref = { current: null as TerminalRenderable | null }
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal
        ref={(r: TerminalRenderable) => { ref.current = r }}
        cols={80}
        rows={10}
        style={{ width: 80, height: 10 }}
      />,
      { width: 80, height: 10 }
    )
    await renderOnce()

    ref.current?.feed("\x1b[32mStarting...\x1b[0m\n")
    ref.current?.feed("Processing file 1\n")
    ref.current?.feed("Processing file 2\n")
    ref.current?.feed("\x1b[32mDone!\x1b[0m")
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Starting...")
    expect(output).toContain("Processing file 1")
    expect(output).toContain("Done!")
  })

  it("should reset terminal", async () => {
    const ref = { current: null as TerminalRenderable | null }
    const { renderOnce, captureCharFrame } = await testRender(
      <terminal
        ref={(r: TerminalRenderable) => { ref.current = r }}
        cols={40}
        rows={10}
        style={{ width: 40, height: 10 }}
      />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    ref.current?.feed("Old Content")
    await renderOnce()
    expect(captureCharFrame()).toContain("Old Content")

    ref.current?.reset()
    ref.current?.feed("New Content")
    await renderOnce()
    expect(captureCharFrame()).toContain("New Content")
  })

  it("should track cursor position", async () => {
    const ref = { current: null as TerminalRenderable | null }
    const { renderOnce } = await testRender(
      <terminal
        ref={(r: TerminalRenderable) => { ref.current = r }}
        cols={80}
        rows={24}
        style={{ width: 80, height: 24 }}
      />,
      { width: 80, height: 24 }
    )
    await renderOnce()

    ref.current?.feed("Hello")
    expect(ref.current?.getCursor()).toEqual([5, 0])

    ref.current?.feed("\nLine 2")
    const cursor = ref.current?.getCursor()
    expect(cursor?.[0]).toBe(6)
    expect(cursor?.[1]).toBe(1)
  })

  it("should get text content", async () => {
    const ref = { current: null as TerminalRenderable | null }
    const { renderOnce } = await testRender(
      <terminal
        ref={(r: TerminalRenderable) => { ref.current = r }}
        cols={80}
        rows={24}
        style={{ width: 80, height: 24 }}
      />,
      { width: 80, height: 24 }
    )
    await renderOnce()

    ref.current?.feed("\x1b[32mColored\x1b[0m Text")
    expect(ref.current?.getText()).toContain("Colored Text")
  })
})
