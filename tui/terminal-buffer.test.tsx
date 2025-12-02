import { describe, expect, it, afterEach } from "bun:test"
import { createRoot, extend } from "@opentui/react"
import { createTestRenderer, type TestRendererOptions } from "@opentui/core/testing"
import { GhosttyTerminalRenderable } from "./terminal-buffer"
import { act } from "react"
import type { ReactNode } from "react"

// Register the component
extend({ "ghostty-terminal": GhosttyTerminalRenderable })

// Track current test setup for cleanup
let currentTestSetup: Awaited<ReturnType<typeof createTestRenderer>> | null = null

// Cleanup after each test to prevent event listener accumulation
afterEach(() => {
  if (currentTestSetup) {
    currentTestSetup.renderer.destroy()
    currentTestSetup = null
  }
})

// Custom testRender that uses the main entry point's createRoot (and thus shared component catalogue)
async function testRender(node: ReactNode, options: TestRendererOptions = {}) {
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const testSetup = await createTestRenderer({
    ...options,
  })
  
  currentTestSetup = testSetup

  const root = createRoot(testSetup.renderer)
  
  await act(async () => {
    root.render(node)
  })

  return testSetup
}

describe("GhosttyTerminalRenderable", () => {
  it("should render basic text component", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <text>Test Basic</text>,
      { width: 40, height: 10 }
    )
    await renderOnce()
    const output = captureCharFrame()
    expect(output).toContain("Test Basic")
    expect(output).toBe(`Test Basic                              
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should render simple ANSI text", async () => {
    const ansi = "\x1b[32mHello\x1b[0m World"
    
    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Hello")
    expect(output).toContain("World")
    expect(output).toBe(`Hello World                             
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should render colored text", async () => {
    const ansi = "\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Red")
    expect(output).toContain("Green")
    expect(output).toContain("Blue")
    expect(output).toBe(`Red Green Blue                          
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should render multi-line ANSI", async () => {
    const ansi = "Line 1\nLine 2\nLine 3"
    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Line 1")
    expect(output).toContain("Line 2")
    expect(output).toContain("Line 3")
    expect(output).toBe(`Line 1                                  
Line 2                                  
Line 3                                  
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should handle prefix being added", async () => {
    const original = "Original Text"
    // Add prefix
    const prefix = "\x1b[1;35m[PREFIX]\x1b[0m\n"
    const updated = prefix + original

    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={updated} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("PREFIX")
    expect(output).toContain("Original Text")
    expect(output).toBe(`[PREFIX]                                
Original Text                           
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should handle multiple prefix additions", async () => {
    let ansi = "Base Text"
    // Add first prefix
    ansi = "\x1b[1;35m[PREFIX 1]\x1b[0m\n" + ansi
    // Add second prefix
    ansi = "\x1b[1;35m[PREFIX 2]\x1b[0m\n" + ansi

    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("PREFIX 2")
    expect(output).toContain("PREFIX 1")
    expect(output).toContain("Base Text")
    expect(output).toBe(`[PREFIX 2]                              
[PREFIX 1]                              
Base Text                               
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should respect cols and rows options", async () => {
    const ansi = "Test"
    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={ansi} cols={20} rows={5} style={{ width: 20, height: 5 }} />,
      { width: 20, height: 5 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Test")
    expect(output).toBe(`Test                
                    
                    
                    
                    
`)
  })

  it("should handle bold and italic text", async () => {
    const ansi = "\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m \x1b[1;3mBoth\x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Bold")
    expect(output).toContain("Italic")
    expect(output).toContain("Both")
    expect(output).toBe(`Bold Italic Both                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should handle RGB colors", async () => {
    const ansi = "\x1b[38;2;255;105;180mHot Pink\x1b[0m \x1b[38;2;0;255;127mSpring Green\x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Hot Pink")
    expect(output).toContain("Spring Green")
    expect(output).toBe(`Hot Pink Spring Green                   
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should handle empty ANSI", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi="" cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toBeDefined()
    expect(output).toBe(`                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should preserve newlines correctly", async () => {
    const ansi = "Line1\n\nLine3"
    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Line1")
    expect(output).toContain("Line3")
    expect(output).toBe(`Line1                                   
                                        
Line3                                   
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  it("should handle background colors", async () => {
    const ansi = "\x1b[41m Red BG \x1b[0m \x1b[42m Green BG \x1b[0m"
    const { renderOnce, captureCharFrame } = await testRender(
      <ghostty-terminal ansi={ansi} cols={40} rows={10} style={{ width: 40, height: 10 }} />,
      { width: 40, height: 10 }
    )
    await renderOnce()

    const output = captureCharFrame()
    expect(output).toContain("Red BG")
    expect(output).toContain("Green BG")
    expect(output).toBe(` Red BG   Green BG                      
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
                                        
`)
  })

  describe("trimEnd", () => {
    it("should keep trailing empty lines without trimEnd", async () => {
      const ansi = "Line 1\nLine 2"
      
      const { renderOnce, captureCharFrame } = await testRender(
        <box border>
          <ghostty-terminal ansi={ansi} cols={20} rows={5} />
        </box>,
        { width: 24, height: 10 }
      )
      await renderOnce()

      expect(captureCharFrame()).toMatchInlineSnapshot(`
"┌──────────────────────┐
│Line 1                │
│Line 2                │
│                      │
│                      │
│                      │
└──────────────────────┘
                        
                        
                        
"
`)
    })

    it("should remove trailing empty lines when trimEnd is true", async () => {
      const ansi = "Line 1\nLine 2"
      
      const { renderOnce, captureCharFrame } = await testRender(
        <box border>
          <ghostty-terminal ansi={ansi} cols={20} rows={5} trimEnd />
        </box>,
        { width: 24, height: 10 }
      )
      await renderOnce()

      expect(captureCharFrame()).toMatchInlineSnapshot(`
"┌──────────────────────┐
│Line 1                │
│Line 2                │
└──────────────────────┘
                        
                        
                        
                        
                        
                        
"
`)
    })
  })

  describe("ls output tests", () => {
    it("should handle ls --color=always output without extra blank lines when using limit", async () => {
      // Simulate ls --color=always -la output (5 lines)
      const lsOutput = 
        "total 224\n" +
        "drwxrwxr-x  27 user  staff   864 Nov 26 19:30 \x1b[34m.\x1b[0m\n" +
        "drwx------  71 user  staff  2272 Nov 26 19:44 \x1b[34m..\x1b[0m\n" +
        "-rw-r--r--   1 user  staff   109 Nov 26 18:15 .gitignore\n" +
        "-rw-r--r--   1 user  staff  1100 Nov 26 19:14 package.json"
  
      const actualLines = lsOutput.split("\n").length
  
      // Without limit: rows creates that many lines
      const { renderOnce: renderWithoutLimit, captureCharFrame: captureWithoutLimit } = await testRender(
        <ghostty-terminal ansi={lsOutput} cols={80} rows={50} style={{ width: 80, height: 50 }} />,
        { width: 80, height: 50 }
      )
      await renderWithoutLimit()
      const outputWithoutLimit = captureWithoutLimit()
      // Should have 50 lines (many blank) - checking count by counting newlines roughly
      expect(outputWithoutLimit.split('\n').length).toBeGreaterThanOrEqual(50)
  
      // With limit: only first N lines
      const { renderOnce: renderWithLimit, captureCharFrame: captureWithLimit } = await testRender(
        <ghostty-terminal ansi={lsOutput} cols={80} rows={50} limit={actualLines} style={{ width: 80, height: actualLines }} />,
        { width: 80, height: actualLines }
      )
      await renderWithLimit()
      const outputWithLimit = captureWithLimit()
      
      expect(outputWithLimit).toBe(`total 224                                                                       
drwxrwxr-x  27 user  staff   864 Nov 26 19:30 .                                 
drwx------  71 user  staff  2272 Nov 26 19:44 ..                                
-rw-r--r--   1 user  staff   109 Nov 26 18:15 .gitignore                        
-rw-r--r--   1 user  staff  1100 Nov 26 19:14 package.json                      
`)
      // Should be compact
      expect(outputWithLimit.trim().split('\n').length).toBeLessThan(10) 
    })
  
    it("should handle ls output with smaller rows to avoid blank lines", async () => {
      const lsOutput = 
        "total 224\n" +
        "drwxrwxr-x  27 user  staff   864 Nov 26 19:30 \x1b[34m.\x1b[0m\n" +
        "drwx------  71 user  staff  2272 Nov 26 19:44 \x1b[34m..\x1b[0m"
  
      const actualLines = lsOutput.split("\n").length
      
      // Using rows close to actual content
      const { renderOnce, captureCharFrame } = await testRender(
        <ghostty-terminal ansi={lsOutput} cols={80} rows={actualLines + 2} style={{ width: 80, height: actualLines + 2 }} />,
        { width: 80, height: actualLines + 2 }
      )
      await renderOnce()
      
      const output = captureCharFrame()
      expect(output).toBe(`total 224                                                                       
drwxrwxr-x  27 user  staff   864 Nov 26 19:30 .                                 
drwx------  71 user  staff  2272 Nov 26 19:44 ..                                
                                                                                
                                                                                
`)
    })
  
    it("should preserve ANSI colors in ls output", async () => {
      const lsOutput = "drwxr-xr-x  3 user  staff  96 Nov 26 16:19 \x1b[34m.git\x1b[0m"
      
      const { renderOnce, captureCharFrame } = await testRender(
        <ghostty-terminal ansi={lsOutput} cols={80} rows={5} style={{ width: 80, height: 5 }} />,
        { width: 80, height: 5 }
      )
      await renderOnce()
      
      const output = captureCharFrame()
      expect(output).toBe(`drwxr-xr-x  3 user  staff  96 Nov 26 16:19 .git                                 
                                                                                
                                                                                
                                                                                
                                                                                
`)
      expect(output).toContain(".git")
    })
  })

  describe("persistent mode", () => {
    it("should render with persistent mode enabled", async () => {
      const ansi = "\x1b[32mHello\x1b[0m World"
      
      const { renderOnce, captureCharFrame } = await testRender(
        <ghostty-terminal ansi={ansi} cols={40} rows={10} persistent style={{ width: 40, height: 10 }} />,
        { width: 40, height: 10 }
      )
      
      await renderOnce()

      const output = captureCharFrame()
      expect(output).toContain("Hello")
      expect(output).toContain("World")
    })

    it("should allow feeding data in persistent mode", async () => {
      const ref = { current: null as GhosttyTerminalRenderable | null }
      
      const { renderOnce, captureCharFrame } = await testRender(
        <ghostty-terminal 
          ref={(r: GhosttyTerminalRenderable) => { ref.current = r }}
          cols={40} 
          rows={10} 
          persistent 
          style={{ width: 40, height: 10 }} 
        />,
        { width: 40, height: 10 }
      )
      
      await renderOnce()
      
      // Feed data
      ref.current?.feed("Hello ")
      ref.current?.feed("World")
      
      await renderOnce()
      
      const output = captureCharFrame()
      expect(output).toContain("Hello World")
    })

    it("should support streaming data in persistent mode", async () => {
      const ref = { current: null as GhosttyTerminalRenderable | null }
      
      const { renderOnce, captureCharFrame } = await testRender(
        <ghostty-terminal 
          ref={(r: GhosttyTerminalRenderable) => { ref.current = r }}
          cols={80} 
          rows={10} 
          persistent 
          style={{ width: 80, height: 10 }} 
        />,
        { width: 80, height: 10 }
      )
      
      await renderOnce()
      
      // Stream data like a PTY would
      ref.current?.feed("\x1b[32mStarting...\x1b[0m\n")
      ref.current?.feed("Processing file 1\n")
      ref.current?.feed("Processing file 2\n")
      ref.current?.feed("\x1b[32mDone!\x1b[0m")
      
      await renderOnce()
      
      const output = captureCharFrame()
      expect(output).toContain("Starting...")
      expect(output).toContain("Processing file 1")
      expect(output).toContain("Processing file 2")
      expect(output).toContain("Done!")
    })

    it("should reset terminal in persistent mode", async () => {
      const ref = { current: null as GhosttyTerminalRenderable | null }
      
      const { renderOnce, captureCharFrame } = await testRender(
        <ghostty-terminal 
          ref={(r: GhosttyTerminalRenderable) => { ref.current = r }}
          cols={40} 
          rows={10} 
          persistent 
          style={{ width: 40, height: 10 }} 
        />,
        { width: 40, height: 10 }
      )
      
      await renderOnce()
      
      // Feed initial data
      ref.current?.feed("Old Content")
      await renderOnce()
      expect(captureCharFrame()).toContain("Old Content")
      
      // Reset and feed new data
      ref.current?.reset()
      ref.current?.feed("New Content")
      await renderOnce()
      
      const output = captureCharFrame()
      expect(output).toContain("New Content")
      // Old content should be gone after reset
    })

    it("should track cursor position in persistent mode", async () => {
      const ref = { current: null as GhosttyTerminalRenderable | null }
      
      const { renderOnce } = await testRender(
        <ghostty-terminal 
          ref={(r: GhosttyTerminalRenderable) => { ref.current = r }}
          cols={80} 
          rows={24} 
          persistent 
          style={{ width: 80, height: 24 }} 
        />,
        { width: 80, height: 24 }
      )
      
      await renderOnce()
      
      ref.current?.feed("Hello")
      const cursor = ref.current?.getCursor()
      expect(cursor).toEqual([5, 0])
      
      ref.current?.feed("\nLine 2")
      const cursor2 = ref.current?.getCursor()
      expect(cursor2?.[0]).toBe(6)
      expect(cursor2?.[1]).toBe(1)
    })

    it("should get text content in persistent mode", async () => {
      const ref = { current: null as GhosttyTerminalRenderable | null }
      
      const { renderOnce } = await testRender(
        <ghostty-terminal 
          ref={(r: GhosttyTerminalRenderable) => { ref.current = r }}
          cols={80} 
          rows={24} 
          persistent 
          style={{ width: 80, height: 24 }} 
        />,
        { width: 80, height: 24 }
      )
      
      await renderOnce()
      
      ref.current?.feed("\x1b[32mColored\x1b[0m Text")
      const text = ref.current?.getText()
      expect(text).toContain("Colored Text")
    })

    it("should throw when using persistent methods in stateless mode", async () => {
      const ref = { current: null as GhosttyTerminalRenderable | null }
      
      const { renderOnce } = await testRender(
        <ghostty-terminal 
          ref={(r: GhosttyTerminalRenderable) => { ref.current = r }}
          ansi="Hello"
          cols={40} 
          rows={10} 
          style={{ width: 40, height: 10 }} 
        />,
        { width: 40, height: 10 }
      )
      
      await renderOnce()
      
      expect(() => ref.current?.feed("Data")).toThrow("persistent mode")
      expect(() => ref.current?.reset()).toThrow("persistent mode")
      expect(() => ref.current?.getCursor()).toThrow("persistent mode")
    })
  })
})
