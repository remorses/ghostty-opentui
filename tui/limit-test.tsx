import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, extend } from "@opentui/react"
import { TerminalBufferRenderable } from "./terminal-buffer"

// Register the terminal-buffer component
extend({ "terminal-buffer": TerminalBufferRenderable })

function App() {
  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      process.exit(0)
    }
  })

  // Generate 1000 lines of ANSI output
  const lines: string[] = []
  for (let i = 0; i < 1000; i++) {
    const colors = ["\x1b[31m", "\x1b[32m", "\x1b[33m", "\x1b[34m", "\x1b[35m", "\x1b[36m"]
    const color = colors[i % colors.length]
    lines.push(`${color}Line ${i + 1}: This is a test line with some content\x1b[0m`)
  }
  const hugeAnsi = lines.join("\n")

  return (
    <box style={{ flexDirection: "column", padding: 2, gap: 1 }}>
      <text fg="#8b949e">Terminal Buffer Limit Test - Press 'q' to quit</text>
      <text fg="#green">Testing limit parameter to truncate output and save CPU</text>
      
      {/* Test 1: No limit (shows all 1000 lines - slow!) */}
      <box
        title="Test 1: No limit (1000 lines)"
        border
        style={{
          backgroundColor: "#2a1a1a",
          borderColor: "#red",
          padding: 1,
          maxHeight: 10,
        }}
      >
        <terminal-buffer 
          ansi={hugeAnsi} 
          cols={80} 
          rows={1000}
        />
      </box>
      <text fg="#666">⚠ Without limit, all 1000 lines are processed (CPU intensive)</text>
      
      {/* Test 2: limit=10 (only first 10 lines) */}
      <box
        title="Test 2: limit=10 (first 10 lines only)"
        border
        style={{
          backgroundColor: "#1a2a1a",
          borderColor: "#green",
          padding: 1,
        }}
      >
        <terminal-buffer 
          ansi={hugeAnsi} 
          cols={80} 
          rows={1000}
          limit={10}
        />
      </box>
      <text fg="#666">✓ With limit=10, only first 10 lines processed (fast!)</text>
      
      {/* Test 3: limit=3 */}
      <box
        title="Test 3: limit=3 (preview mode)"
        border
        style={{
          backgroundColor: "#1a1a2a",
          borderColor: "#cyan",
          padding: 1,
        }}
      >
        <terminal-buffer 
          ansi={hugeAnsi} 
          cols={80} 
          rows={1000}
          limit={3}
        />
      </box>
      <text fg="#666">✓ limit=3 for quick previews</text>

      {/* Test 4: limit=1 */}
      <box
        title="Test 4: limit=1 (first line only)"
        border
        style={{
          backgroundColor: "#2a2a1a",
          borderColor: "#yellow",
          padding: 1,
        }}
      >
        <terminal-buffer 
          ansi={hugeAnsi} 
          cols={80} 
          rows={1000}
          limit={1}
        />
      </box>
      <text fg="#666">✓ limit=1 shows just the first line</text>

      <text fg="#green" style={{ marginTop: 1 }}>Use limit for log previews to avoid processing huge files!</text>
    </box>
  )
}

if (import.meta.main) {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  createRoot(renderer).render(<App />)
}
