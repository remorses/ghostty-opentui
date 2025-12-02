import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, extend } from "@opentui/react"
import { useState, useRef } from "react"
import { spawn, type IPty } from "bun-pty"
import { GhosttyTerminalRenderable } from "./terminal-buffer"

// Register the ghostty-terminal component
extend({ "ghostty-terminal": GhosttyTerminalRenderable })

interface Button {
  label: string
  data: string
}

const BUTTONS: Button[] = [
  { label: "[1] Send 'hello world'", data: "hello world" },
  { label: "[2] Send Enter", data: "\r" },
  { label: "[3] Send 'ls -la'", data: "ls -la" },
  { label: "[4] Send Ctrl+C", data: "\x03" },
  { label: "[5] Send 'exit'", data: "exit" },
]

function App() {
  const [output, setOutput] = useState("")
  const [selectedButton, setSelectedButton] = useState(0)
  const [status, setStatus] = useState("Starting...")
  const ptyRef = useRef<IPty | null>(null)
  const terminalRef = useRef<GhosttyTerminalRenderable>(null)

  // Initialize PTY on first render
  if (!ptyRef.current) {
    const pty = spawn("bash", [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
    })

    pty.onData((data) => {
      setOutput((prev) => prev + data)
    })

    pty.onExit(({ exitCode }) => {
      setStatus(`Process exited with code ${exitCode}`)
    })

    ptyRef.current = pty
    setStatus("Running bash")
  }

  const sendData = (data: string) => {
    if (ptyRef.current) {
      ptyRef.current.write(data)
      if (data === "\r") {
        setStatus("Sent: Enter")
      } else if (data === "\x03") {
        setStatus("Sent: Ctrl+C")
      } else {
        setStatus(`Sent: "${data}"`)
      }
    }
  }

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      if (ptyRef.current) {
        ptyRef.current.kill()
      }
      process.exit(0)
    }

    // Number keys to trigger buttons
    if (key.name === "1") sendData(BUTTONS[0].data)
    if (key.name === "2") sendData(BUTTONS[1].data)
    if (key.name === "3") sendData(BUTTONS[2].data)
    if (key.name === "4") sendData(BUTTONS[3].data)
    if (key.name === "5") sendData(BUTTONS[4].data)

    // Arrow keys to navigate buttons
    if (key.name === "up") {
      setSelectedButton((prev) => (prev > 0 ? prev - 1 : BUTTONS.length - 1))
    }
    if (key.name === "down") {
      setSelectedButton((prev) => (prev < BUTTONS.length - 1 ? prev + 1 : 0))
    }

    // Enter to activate selected button
    if (key.name === "return") {
      sendData(BUTTONS[selectedButton].data)
    }
  })

  return (
    <box style={{ flexDirection: "row", flexGrow: 1 }}>
      {/* Left panel - buttons */}
      <box
        style={{
          width: 30,
          flexDirection: "column",
          border: true,
          borderColor: "#444",
          padding: 1,
        }}
      >
        <text fg="#58a6ff" style={{ marginBottom: 1 }}>
          Commands
        </text>

        {BUTTONS.map((btn, i) => (
          <text
            key={i}
            fg={selectedButton === i ? "#000" : "#d4d4d4"}
            bg={selectedButton === i ? "#58a6ff" : undefined}
          >
            {btn.label}
          </text>
        ))}

        <text fg="#8b949e" style={{ marginTop: 2 }}>
          Use arrow keys + Enter
        </text>
        <text fg="#8b949e">or number keys 1-5</text>
        <text fg="#8b949e" style={{ marginTop: 1 }}>
          Press 'q' to quit
        </text>

        <box style={{ marginTop: 2, paddingTop: 1 }}>
          <text fg="#8b949e">Status:</text>
          <text fg="#58a6ff">{status}</text>
        </box>
      </box>

      {/* Right panel - terminal output */}
      <box
        style={{
          flexGrow: 1,
          flexDirection: "column",
          border: true,
          borderColor: "#444",
          marginLeft: 1,
        }}
      >
        <box style={{ height: 1, paddingLeft: 1, backgroundColor: "#333" }}>
          <text fg="#58a6ff">Terminal Output</text>
        </box>
        <scrollbox focused style={{ flexGrow: 1 }}>
          <ghostty-terminal
            ref={terminalRef}
            ansi={output}
            cols={80}
            rows={100}
            trimEnd
          />
        </scrollbox>
      </box>
    </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App />)
