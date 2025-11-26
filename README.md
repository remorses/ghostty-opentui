# pty-to-json

Fast ANSI/VT terminal parser powered by [Ghostty's](https://github.com/ghostty-org/ghostty) Zig terminal emulation library. Converts raw PTY logs to JSON or renders them in a TUI viewer.

## Features

- **Fast** - Written in Zig, processes terminal escape sequences at native speed
- **Full VT emulation** - ANSI colors (16/256/RGB), styles, cursor movements, scrolling
- **TUI Viewer** - Interactive terminal viewer built with [opentui](https://github.com/sst/opentui)
- **JSON output** - Compact format with merged spans for rendering
- **Bun FFI** - Use the Zig library directly from TypeScript

## Installation

```bash
bun add opentui-ansi-vt
```

For TUI rendering, you'll also need:
```bash
bun add @opentui/core @opentui/react  # For React
# or
bun add @opentui/core @opentui/solid  # For Solid.js
```

## Usage

### Basic FFI Usage

```typescript
import { ptyToJson, type TerminalData } from "opentui-ansi-vt"

// Parse ANSI string or buffer
const data: TerminalData = ptyToJson("\x1b[32mHello\x1b[0m World", {
  cols: 120,
  rows: 40,
})

console.log(data.lines) // Array of lines with styled spans
console.log(data.cursor) // [col, row] cursor position
```

### With OpenTUI React

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, extend } from "@opentui/react"
import { TerminalBufferRenderable } from "opentui-ansi-vt/terminal-buffer"

// Register the terminal-buffer component
extend({ "terminal-buffer": TerminalBufferRenderable })

const ANSI = `\x1b[1;32muser@host\x1b[0m:\x1b[1;34m~/app\x1b[0m$ ls
\x1b[1;34msrc\x1b[0m  package.json  \x1b[1;32mbuild.sh\x1b[0m
\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[33mYellow\x1b[0m \x1b[34mBlue\x1b[0m
`

function App() {
  useKeyboard((key) => {
    if (key.name === "q") process.exit(0)
  })

  return (
    <scrollbox focused style={{ flexGrow: 1 }}>
      <terminal-buffer ansi={ANSI} cols={80} rows={24} />
    </scrollbox>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App />)
```

### With OpenTUI Solid.js

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, extend } from "@opentui/solid"
import { TerminalBufferRenderable } from "opentui-ansi-vt/terminal-buffer"

// Register the terminal-buffer component
extend({ "terminal-buffer": TerminalBufferRenderable })

const ANSI = `\x1b[1;32muser@host\x1b[0m:\x1b[1;34m~/app\x1b[0m$ ls
\x1b[1;34msrc\x1b[0m  package.json  \x1b[1;32mbuild.sh\x1b[0m
\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[33mYellow\x1b[0m \x1b[34mBlue\x1b[0m
`

function App() {
  useKeyboard((key) => {
    if (key.name === "q") process.exit(0)
  })

  return (
    <scrollbox focused style={{ "flex-grow": 1 }}>
      <terminal-buffer ansi={ANSI} cols={80} rows={24} />
    </scrollbox>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App />)
```

### Terminal Buffer Component

The `<terminal-buffer>` component accepts raw ANSI input and renders it with full styling support. 

**Important**: You must call `extend()` to register the component before using it in JSX:

```tsx
import { extend } from "@opentui/react" // or "@opentui/solid"
import { TerminalBufferRenderable } from "opentui-ansi-vt/terminal-buffer"

// Register the component
extend({ "terminal-buffer": TerminalBufferRenderable })

// Now you can use it with raw ANSI input
<terminal-buffer ansi={ansiString} cols={80} rows={24} />

// cols and rows are optional (defaults: cols=120, rows=40)
<terminal-buffer ansi={ansiString} />
```

### API

#### Main Export

```typescript
import { ptyToJson, type TerminalData } from "opentui-ansi-vt"

// Parse ANSI data (if you need direct access to the data structure)
const data = ptyToJson(input, options)
```

#### Terminal Buffer Component

```typescript
import { TerminalBufferRenderable } from "opentui-ansi-vt/terminal-buffer"
import { extend } from "@opentui/react" // or "@opentui/solid"

// Register component
extend({ "terminal-buffer": TerminalBufferRenderable })

// Use in JSX (component calls ptyToJson internally)
<terminal-buffer ansi={ansiString} cols={80} rows={24} />
```

### TypeScript Types

```typescript
import type { 
  TerminalData, 
  TerminalLine, 
  TerminalSpan, 
  PtyToJsonOptions 
} from "opentui-ansi-vt"

import type { 
  TerminalBufferRenderable,
  TerminalBufferOptions
} from "opentui-ansi-vt/terminal-buffer"

interface TerminalData {
  cols: number
  rows: number
  cursor: [number, number]
  offset: number
  totalLines: number
  lines: TerminalLine[]
}

interface TerminalSpan {
  text: string
  fg: string | null   // hex color e.g. "#ff5555"
  bg: string | null
  flags: number       // StyleFlags bitmask
  width: number
}

interface TerminalBufferOptions {
  ansi: string | Buffer  // Raw ANSI input
  cols?: number          // Terminal width (default: 120)
  rows?: number          // Terminal height (default: 40)
}

// StyleFlags: bold=1, italic=2, underline=4, strikethrough=8, inverse=16, faint=32
```

## Quick Start (Development)

```bash
# Setup (installs Zig 0.15.2, clones Ghostty, builds)
./setup.sh

# Run TUI viewer with sample
bun run dev

# Or convert a file to JSON
./zig-out/bin/pty-to-json session.log > output.json
```

## TUI Viewer

```bash
bun run dev                      # sample ANSI demo
bun run dev testdata/session.log # view a file
```

Controls: `↑/↓` scroll, `Page Up/Down` page, `Home/End` jump, `q/Esc` quit

```
┌─────────────────────────────────────┐
│ rootOptions (outer container)       │
│  ┌─────────────────────────────┐ ▲  │
│  │ viewport (visible area)     │ █  │ ← scrollbar
│  │  ┌─────────────────────┐    │ █  │
│  │  │ content (padded)    │    │ █  │
│  │  │  ┌───────────────┐  │    │ ▼  │
│  │  │  │ terminal lines│  │    │    │
│  │  │  └───────────────┘  │    │    │
│  │  └─────────────────────┘    │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 120x40 | Cursor | Lines     │    │ ← info bar
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Raw PTY     │ ──▶ │  Zig VT      │ ──▶ │  JSON/TUI    │
│  (ANSI bytes)│     │  Emulator    │     │  Output      │
└──────────────┘     └──────────────┘     └──────────────┘
```

1. **Input** - Raw PTY bytes with ANSI escape sequences
2. **Zig Processing** - Ghostty's VT parser emulates a full terminal
3. **Output** - JSON with styled spans, or rendered in TUI

The Zig library is exposed via Bun FFI for the TUI:

```typescript
import { ptyToJson } from "./tui/ffi"

const data = ptyToJson(ansiBuffer, { cols: 120, rows: 40 })
// Returns: { cols, rows, cursor, lines: [{ spans: [...] }] }
```

## JSON Format

```json
{
  "cols": 120,
  "rows": 40,
  "cursor": [0, 5],
  "totalLines": 42,
  "lines": [
    [["Hello ", "#5555ff", null, 1, 6], ["World", "#55ff55", null, 0, 5]]
  ]
}
```

Each span: `[text, fg, bg, flags, width]`

Flags: `bold=1, italic=2, underline=4, strikethrough=8, inverse=16, faint=32`

## CLI Usage

```bash
pty-to-json [OPTIONS] [FILE]

Options:
  -c, --cols N      Terminal width (default: 120)
  -r, --rows N      Terminal height (default: 40)
  -o, --output FILE Write to file instead of stdout
  --offset N        Start from line N (pagination)
  --limit N         Max lines to output
```

## Platform Support

| Platform | Status |
|----------|--------|
| Linux x64 | Supported |
| Linux ARM64 | Supported |
| macOS ARM64 (Apple Silicon) | Supported |
| macOS x64 (Intel) | Supported |
| Windows | Not supported |

### Why no Windows?

Windows builds fail due to a **Zig build system bug** with path handling when compiling Ghostty. The error occurs in `std.Build.Step.Run.zig`:

```
assert(!std.fs.path.isAbsolute(child_cwd_rel))
```

This is an upstream issue with Zig/Ghostty, not something fixable in this project. Ghostty itself doesn't officially support Windows yet. Windows users can use **WSL** (Windows Subsystem for Linux) as a workaround.

## Requirements

- **Zig 0.15.2** - Required by Ghostty
- **Bun** - For TUI viewer and FFI
- **Ghostty** - Cloned adjacent to this repo (setup.sh handles this)
- **Linux or macOS** - Windows not supported (see above)

## Development

```bash
zig build                        # debug build
zig build -Doptimize=ReleaseFast # release build
zig build test                   # run Zig tests
bun test                         # run TUI tests
```

## License

MIT
