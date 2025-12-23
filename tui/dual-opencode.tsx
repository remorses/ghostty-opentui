import { createCliRenderer, type CliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useTerminalDimensions, useOnResize, useRenderer, extend } from "@opentui/react"
import { useState, useRef, useEffect } from "react"
import { spawn, type IPty } from "bun-pty"
import { TerminalRenderable } from "../src/terminal-buffer"

// Register the terminal component (for streaming/interactive use)
extend({ "terminal": TerminalRenderable })

// Control sequences we handle ourselves (Tab, Alt+1, Alt+2, Ctrl+Q)
const CONTROL_SEQUENCES = new Set([
  "\t",           // Tab
  "\x1b1",        // Alt+1
  "\x1b2",        // Alt+2  
  "\x11",         // Ctrl+Q
])

// Borders and padding overhead
const HORIZONTAL_OVERHEAD = 4 // 2 borders per panel
const VERTICAL_OVERHEAD = 4   // Header + borders

interface TerminalPanelProps {
  index: number
  isSelected: boolean
  cols: number
  rows: number
  terminalRef: React.RefObject<TerminalRenderable>
}

function TerminalPanel({ index, isSelected, cols, rows, terminalRef }: TerminalPanelProps) {
  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: "column",
        border: true,
        borderColor: isSelected ? "#58a6ff" : "#444",
        marginLeft: index > 0 ? 1 : 0,
      }}
    >
      <box style={{ height: 1, paddingLeft: 1, backgroundColor: isSelected ? "#58a6ff" : "#333" }}>
        <text fg={isSelected ? "#000" : "#8b949e"}>
          opencode {index + 1} {isSelected ? "(active)" : ""}
        </text>
      </box>
      <terminal
        ref={terminalRef}
        cols={cols}
        rows={rows}
        trimEnd
      />
    </box>
  )
}

function App() {
  const [selected, setSelected] = useState(0)
  const ptyRefs = useRef<(IPty | null)[]>([null, null])
  const terminalRefs = [
    useRef<TerminalRenderable>(null),
    useRef<TerminalRenderable>(null),
  ]

  // Get terminal dimensions
  const { width, height } = useTerminalDimensions()
  const panelWidth = Math.floor((width - HORIZONTAL_OVERHEAD - 1) / 2) // -1 for gap between panels
  const cols = Math.max(40, panelWidth - 2)
  const rows = Math.max(10, height - VERTICAL_OVERHEAD)

  // Resize PTYs when terminal dimensions change
  useOnResize((newWidth, newHeight) => {
    const newPanelWidth = Math.floor((newWidth - HORIZONTAL_OVERHEAD - 1) / 2)
    const newCols = Math.max(40, newPanelWidth - 2)
    const newRows = Math.max(10, newHeight - VERTICAL_OVERHEAD)
    ptyRefs.current.forEach((pty) => {
      pty?.resize(newCols, newRows)
    })
  })

  // Initialize PTYs on first render
  for (let i = 0; i < 2; i++) {
    if (!ptyRefs.current[i]) {
      const pty = spawn("opencode", [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: process.cwd(),
      })

      const termRef = terminalRefs[i]
      pty.onData((data) => {
        termRef.current?.feed(data)
      })

      pty.onExit(() => {
        // Could handle exit if needed
      })

      ptyRefs.current[i] = pty
    }
  }

  const renderer = useRenderer() as CliRenderer
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  // Set up raw input handler to forward everything to PTY
  useEffect(() => {
    const handler = (sequence: string): boolean => {
      // Handle our control sequences
      if (sequence === "\x11") { // Ctrl+Q
        ptyRefs.current.forEach((pty) => pty?.kill())
        process.exit(0)
      }
      if (sequence === "\t") { // Tab
        setSelected((prev) => (prev + 1) % 2)
        return true // handled, don't forward
      }
      if (sequence === "\x1b1") { // Alt+1
        setSelected(0)
        return true
      }
      if (sequence === "\x1b2") { // Alt+2
        setSelected(1)
        return true
      }

      // Forward everything else (keyboard, mouse, scroll) to selected PTY
      const pty = ptyRefs.current[selectedRef.current]
      if (pty) {
        pty.write(sequence)
      }
      return true // we handled it, prevent opentui from processing
    }

    renderer.prependInputHandler(handler)
    return () => {
      renderer.removeInputHandler(handler)
    }
  }, [renderer])

  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <box style={{ height: 1, paddingLeft: 1, backgroundColor: "#222" }}>
        <text fg="#8b949e">
          Press <span fg="#58a6ff">Tab</span> to switch | <span fg="#58a6ff">Alt+1/2</span> to select | <span fg="#58a6ff">Ctrl+Q</span> to quit
        </text>
      </box>
      <box style={{ flexDirection: "row", flexGrow: 1 }}>
        <TerminalPanel
          index={0}
          isSelected={selected === 0}
          cols={cols}
          rows={rows}
          terminalRef={terminalRefs[0]}
        />
        <TerminalPanel
          index={1}
          isSelected={selected === 1}
          cols={cols}
          rows={rows}
          terminalRef={terminalRefs[1]}
        />
      </box>
    </box>
  )
}

const renderer = await createCliRenderer({ 
  exitOnCtrlC: false,
  useMouse: true,  // Enable mouse events (scroll, clicks)
})
createRoot(renderer).render(<App />)
