import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useTerminalDimensions, useOnResize, extend } from "@opentui/react"
import { useState, useRef } from "react"
import { spawn, type IPty } from "bun-pty"
import { StatelessTerminalRenderable } from "../src/terminal-buffer"

extend({ "stateless-terminal": StatelessTerminalRenderable })

function App() {
  const ptyRef = useRef<IPty | null>(null)
  const [ptyOutput, setPtyOutput] = useState("")

  const { width } = useTerminalDimensions()
  const cols = Math.max(40, width - 10)
  const rows = 20

  useOnResize((newWidth) => {
    const newCols = Math.max(40, newWidth - 10)
    ptyRef.current?.resize(newCols, rows)
  })

  if (!ptyRef.current) {
    const pty = spawn("opencode", [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: process.cwd(),
    })

    pty.onData((data) => {
      setPtyOutput((prev) => prev + data)
    })

    ptyRef.current = pty
  }

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      ptyRef.current?.kill()
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

      <box
        title="Test 1: No limit (1000 lines)"
        border
        style={{ backgroundColor: "#2a1a1a", borderColor: "#red", padding: 1, maxHeight: 10 }}
      >
        <stateless-terminal ansi={hugeAnsi} cols={80} rows={1000} />
      </box>
      <text fg="#666">Without limit, all 1000 lines are processed (slow)</text>

      <box
        title="Test 2: limit=10"
        border
        style={{ backgroundColor: "#1a2a1a", borderColor: "#green", padding: 1 }}
      >
        <stateless-terminal ansi={hugeAnsi} cols={80} rows={1000} limit={10} />
      </box>
      <text fg="#666">With limit=10, only first 10 lines processed (fast)</text>

      <box
        title="Test 3: limit=3"
        border
        style={{ backgroundColor: "#1a1a2a", borderColor: "#cyan", padding: 1 }}
      >
        <stateless-terminal ansi={hugeAnsi} cols={80} rows={1000} limit={3} />
      </box>
      <text fg="#666">limit=3 for quick previews</text>

      <box
        title="Test 4: limit=1"
        border
        style={{ backgroundColor: "#2a2a1a", borderColor: "#yellow", padding: 1 }}
      >
        <stateless-terminal ansi={hugeAnsi} cols={80} rows={1000} limit={1} />
      </box>
      <text fg="#666">limit=1 shows just the first line</text>

      <box
        title="Test 5: Live PTY via state"
        border
        style={{ backgroundColor: "#1a2a2a", borderColor: "#58a6ff", padding: 1 }}
      >
        <stateless-terminal ansi={ptyOutput} cols={cols} rows={rows} limit={10} trimEnd />
      </box>
      <text fg="#666">Live PTY output via React state (limit=10)</text>

      <text fg="#green" style={{ marginTop: 1 }}>Use limit for log previews to avoid processing huge files!</text>
    </box>
  )
}

if (require.main === module) {
  ;(async () => {
    const renderer = await createCliRenderer({ exitOnCtrlC: true })
    createRoot(renderer).render(<App />)
  })()
}
