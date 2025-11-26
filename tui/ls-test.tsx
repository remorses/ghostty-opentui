import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, extend } from "@opentui/react"
import { TerminalBufferRenderable } from "./terminal-buffer"
import fs from "fs"
import { execSync } from "child_process"

// Register the terminal-buffer component
extend({ "terminal-buffer": TerminalBufferRenderable })

function App() {
  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      process.exit(0)
    }
  })

  // Get actual ls --color=always -la output
  const lsOutput = execSync("ls --color=always -la", { 
    encoding: "utf-8",
    cwd: import.meta.dir + "/.."
  })

  // Count actual lines
  const lineCount = lsOutput.split('\n').filter(l => l.length > 0).length

  return (
    <box style={{ flexDirection: "column", padding: 2, gap: 1 }}>
      <text fg="#8b949e">ls --color=always -la Test - Press 'q' to quit</text>
      <text fg="#yellow">Testing directory listing - rows param creates terminal buffer size!</text>
      <text fg="#666">Actual ls output: {lineCount} lines</text>
      
      {/* Test 1: BAD - rows=50 creates 50 lines with blanks */}
      <box
        title="BAD: rows=50 (creates 50-line buffer with blanks)"
        border
        style={{
          backgroundColor: "#2a1a1a",
          borderColor: "#red",
          padding: 1,
          maxHeight: 12,
        }}
      >
        <terminal-buffer 
          ansi={lsOutput} 
          cols={120} 
          rows={50}
        />
      </box>
      <text fg="#red">✗ Creates {lineCount} + blank lines up to 50 total (ugly!)</text>
      
      {/* Test 2: GOOD - Use limit to cut off at actual content */}
      <box
        title={`GOOD: rows=50 + limit=${lineCount}`}
        border
        style={{
          backgroundColor: "#1a2a1a",
          borderColor: "#green",
          padding: 1,
        }}
      >
        <terminal-buffer 
          ansi={lsOutput} 
          cols={120} 
          rows={50}
          limit={lineCount}
        />
      </box>
      <text fg="#green">✓ limit cuts off blank lines - shows exactly {lineCount} lines!</text>
      
      {/* Test 3: Also GOOD - Use lower rows */}
      <box
        title={`ALSO GOOD: rows=${lineCount + 2}`}
        border
        style={{
          backgroundColor: "#1a1a2a",
          borderColor: "#cyan",
          padding: 1,
        }}
      >
        <terminal-buffer 
          ansi={lsOutput} 
          cols={120} 
          rows={lineCount + 2}
        />
      </box>
      <text fg="#cyan">✓ Or just use smaller rows value (no limit needed)</text>
    </box>
  )
}

if (import.meta.main) {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  createRoot(renderer).render(<App />)
}
