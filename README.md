# ghostty-opentui

Fast ANSI/VT terminal parser powered by [Ghostty's](https://github.com/ghostty-org/ghostty) Zig terminal emulation library. Converts raw PTY logs to JSON, strips ANSI for plain text, or renders them in a TUI viewer.

## Features

- **Fast** - Written in Zig, processes terminal escape sequences at native speed
- **Full VT emulation** - ANSI colors (16/256/RGB), styles, cursor movements, scrolling
- **TUI Viewer** - Interactive terminal viewer built with [opentui](https://github.com/sst/opentui)
- **JSON output** - Compact format with merged spans for rendering
- **Plain text output** - Strip ANSI codes for LLM/text processing
- **Screenshot rendering** - Export terminal output to PNG/JPEG/WebP images via [takumi-rs](https://github.com/anthropics/takumi-rs)
- **N-API** - Native Node.js addon using [napigen](https://github.com/cztomsik/napigen) for seamless integration

## Installation

```bash
bun add ghostty-opentui
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
import { ptyToJson, ptyToText, type TerminalData } from "ghostty-opentui"

// Parse ANSI string or buffer to JSON with styling info
const data: TerminalData = ptyToJson("\x1b[32mHello\x1b[0m World", {
  cols: 120,
  rows: 40,
})

console.log(data.lines) // Array of lines with styled spans
console.log(data.cursor) // [col, row] cursor position
```

### Strip ANSI for Plain Text

Use `ptyToText` to strip all ANSI escape codes and get plain text output. This is useful for sending terminal output to LLMs or other text processors that don't handle ANSI codes.

```typescript
import { ptyToText } from "ghostty-opentui"

// Strip ANSI codes - returns plain text
const plain = ptyToText("\x1b[31mError:\x1b[0m Something went wrong")
// Returns: "Error: Something went wrong"

// Works with complex escape sequences too
const complex = ptyToText("\x1b[1;38;2;255;100;50mBold RGB\x1b[0m text")
// Returns: "Bold RGB text"

// Optional cols for line wrapping (default: 500)
const text = ptyToText(ansiBuffer, { cols: 120 })
```

**Why use `ptyToText` instead of regex?**

Unlike simple regex-based ANSI strippers, `ptyToText` uses a full terminal emulator to process escape sequences. This correctly handles:

- Cursor movements and positioning
- Line wrapping at terminal width
- Scrolling regions
- All SGR (Select Graphic Rendition) sequences
- OSC (Operating System Command) sequences

### With OpenTUI React

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, extend } from "@opentui/react"
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"

// Register the ghostty-terminal component
extend({ "ghostty-terminal": GhosttyTerminalRenderable })

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
      <ghostty-terminal ansi={ANSI} cols={80} rows={24} />
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
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"

// Register the ghostty-terminal component
extend({ "ghostty-terminal": GhosttyTerminalRenderable })

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
      <ghostty-terminal ansi={ANSI} cols={80} rows={24} />
    </scrollbox>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App />)
```

### Ghostty Terminal Component

The `<ghostty-terminal>` component accepts raw ANSI input and renders it with full styling support. 

**Important**: You must call `extend()` to register the component before using it in JSX:

```tsx
import { extend } from "@opentui/react" // or "@opentui/solid"
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"

// Register the component
extend({ "ghostty-terminal": GhosttyTerminalRenderable })

// Now you can use it with raw ANSI input
<ghostty-terminal ansi={ansiString} cols={80} rows={24} />

// cols and rows are optional (defaults: cols=120, rows=40)
<ghostty-terminal ansi={ansiString} />
```

#### Scrolling to Specific Lines

You can scroll to a specific line number in the ANSI output using refs:

```tsx
import { useRef } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"

function App() {
  const scrollBoxRef = useRef<ScrollBoxRenderable>(null)
  const terminalRef = useRef<GhosttyTerminalRenderable>(null)

  const scrollToLine = (lineNumber: number) => {
    if (scrollBoxRef.current && terminalRef.current) {
      const scrollPos = terminalRef.current.getScrollPositionForLine(lineNumber)
      scrollBoxRef.current.scrollTo(scrollPos)
    }
  }

  return (
    <scrollbox ref={scrollBoxRef}>
      <ghostty-terminal ref={terminalRef} ansi={ansiString} />
    </scrollbox>
  )
}
```

The `getScrollPositionForLine(lineNumber)` method:
- Takes a 0-based line number from the ANSI output
- Returns the actual scrollTop position accounting for text wrapping and layout
- Clamps out-of-bounds values automatically

#### Limiting Output for Performance

For large log files, use the `limit` parameter to only render the first N lines. **Limiting happens at the Zig level** before JSON serialization, making it extremely efficient:

```tsx
// Only render first 100 lines of a huge log file
<ghostty-terminal 
  ansi={hugeLogFile} 
  cols={120} 
  rows={10}
  limit={100}  // Limits at Zig level (before JSON parsing!)
/>

// Quick preview: just show first 10 lines
<ghostty-terminal 
  ansi={longOutput} 
  limit={10}
/>
```

Benefits of using `limit`:
- **Maximum performance** - Limits at native Zig level before JSON serialization
- **Lower memory** - Doesn't process or allocate memory for skipped lines
- **Instant preview** - Show first N lines of massive logs without waiting

#### Text Highlighting

You can highlight specific regions of text with custom background colors. This is useful for search results, error highlighting, or drawing attention to specific lines.

```tsx
import { GhosttyTerminalRenderable, type HighlightRegion } from "ghostty-opentui/terminal-buffer"

const highlights: HighlightRegion[] = [
  { line: 0, start: 0, end: 5, backgroundColor: "#ffff00" },           // Yellow highlight
  { line: 2, start: 10, end: 20, backgroundColor: "#ff0000" },         // Red highlight
  { line: 5, start: 0, end: 8, backgroundColor: "#00ff00", replaceWithX: true }, // Mask with 'x'
]

<ghostty-terminal 
  ansi={ansiString} 
  cols={80} 
  rows={24}
  highlights={highlights}
/>
```

**HighlightRegion properties:**
- `line` - Line number (0-based)
- `start` - Start column (0-based, inclusive)  
- `end` - End column (0-based, exclusive)
- `backgroundColor` - Hex color string like `"#ff0000"`
- `replaceWithX` - Optional. If `true`, replaces highlighted text with 'x' characters (useful for testing/masking)

**How highlighting works:**

Highlights are applied during the ANSI-to-StyledText conversion. When you set/update highlights on a `GhosttyTerminalRenderable`, the component re-processes the entire ANSI content to apply the new highlights. This approach:

- Preserves all original text styling (colors, bold, etc.) while adding the highlight background
- Handles highlights that span multiple styled spans correctly
- Works efficiently for most use cases

For very large files with frequently changing highlights, consider using `limit` to reduce the rendered content.

**Programmatic usage without the component:**

```typescript
import { ptyToJson } from "ghostty-opentui"
import { terminalDataToStyledText, type HighlightRegion } from "ghostty-opentui/terminal-buffer"

const data = ptyToJson(ansiString, { cols: 80, rows: 24 })
const highlights: HighlightRegion[] = [
  { line: 0, start: 0, end: 5, backgroundColor: "#ff0000" }
]
const styledText = terminalDataToStyledText(data, highlights)
// styledText.chunks contains TextChunk[] with highlights applied
```

### Screenshot / Image Rendering

Render terminal output to PNG, JPEG, or WebP images using [takumi-rs](https://github.com/anthropics/takumi-rs). Uses bundled JetBrains Mono Nerd font with fixed-width grid alignment.

```typescript
import { ptyToJson } from "ghostty-opentui"
import { renderTerminalToImage } from "ghostty-opentui/image"

const data = ptyToJson("\x1b[32mHello\x1b[0m World", { cols: 80 })
const png = await renderTerminalToImage(data, { format: "png" })
await Bun.write("screenshot.png", png)
```

Custom theme and font size:

```typescript
const image = await renderTerminalToImage(data, {
  format: "jpeg",
  fontSize: 16,
  lineHeight: 1.4,
  paddingX: 32,
  paddingY: 24,
  theme: { background: "#282c34", text: "#abb2bf" },
  quality: 95,
})
```

For large outputs, paginate into multiple images:

```typescript
import { renderTerminalToPaginatedImages } from "ghostty-opentui/image"

const result = await renderTerminalToPaginatedImages(data, {
  maxLinesPerImage: 70,
  format: "png",
})
// result.images   - Buffer[]
// result.paths    - temp file paths
// result.imageCount
```

#### Image rendering performance

Measured on Apple Silicon. The renderer is cached after the first call (font load is one-time).

| Terminal size | Format | Cold (first call) | Warm | Image size |
|---------------|--------|-------------------:|-----:|-----------:|
| 80×24 (small) | JPEG | ~35ms | **3ms** | ~4 KB |
| 80×24 (small) | PNG | ~35ms | **3ms** | ~5 KB |
| 120×50 (typical) | JPEG | — | **142ms** | ~267 KB |
| 120×50 (typical) | PNG | — | **123ms** | ~477 KB |

`getTerminalData()` (Zig parser) adds ~0.06ms overhead — effectively free.

### API

#### Main Export

```typescript
import { ptyToJson, ptyToText, type TerminalData } from "ghostty-opentui"

// Parse ANSI data to JSON with full styling info
const data = ptyToJson(input, options)

// Strip ANSI codes and return plain text (for LLMs, logging, etc.)
const plainText = ptyToText(input, options)
```

#### Ghostty Terminal Component

```typescript
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"
import { extend } from "@opentui/react" // or "@opentui/solid"

// Register component
extend({ "ghostty-terminal": GhosttyTerminalRenderable })

// Use in JSX (component calls ptyToJson internally)
<ghostty-terminal ansi={ansiString} cols={80} rows={24} />
```

### TypeScript Types

```typescript
import type { 
  TerminalData, 
  TerminalLine, 
  TerminalSpan, 
  PtyToJsonOptions,
  PtyToTextOptions
} from "ghostty-opentui"

import type { 
  GhosttyTerminalRenderable,
  GhosttyTerminalOptions,
  HighlightRegion
} from "ghostty-opentui/terminal-buffer"

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

interface PtyToTextOptions {
  cols?: number               // Terminal width for wrapping (default: 500)
  rows?: number               // Terminal height (default: 256)
}

interface GhosttyTerminalOptions {
  ansi: string | Buffer       // Raw ANSI input
  cols?: number               // Terminal width (default: 120)
  rows?: number               // Terminal height (default: 40)
  limit?: number              // Max lines to render (from start)
  highlights?: HighlightRegion[]  // Regions to highlight
}

interface HighlightRegion {
  line: number           // Line number (0-based)
  start: number          // Start column (0-based, inclusive)
  end: number            // End column (0-based, exclusive)
  backgroundColor: string // Hex color like "#ff0000"
  replaceWithX?: boolean // Replace text with 'x' (for testing)
}

// StyleFlags: bold=1, italic=2, underline=4, strikethrough=8, inverse=16, faint=32
```

#### Image Export

```typescript
import type {
  RenderImageOptions,
  RenderPaginatedOptions,
  PaginatedRenderResult,
  ImageTheme,
} from "ghostty-opentui/image"

import {
  renderTerminalToImage,           // single image
  renderTerminalToPaginatedImages, // split large output
} from "ghostty-opentui/image"
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

Controls: `up/down` scroll, `Page Up/Down` page, `Home/End` jump, `q/Esc` quit

```
+-----------------------------------------+
| rootOptions (outer container)            |
|  +-----------------------------------+ ^ |
|  | viewport (visible area)           | X | <- scrollbar
|  |  +-----------------------------+  | X |
|  |  | content (padded)            |  | X |
|  |  |  +---------------------+    |  | v |
|  |  |  | terminal lines      |    |  |   |
|  |  |  +---------------------+    |  |   |
|  |  +-----------------------------+  |   |
|  +-----------------------------------+   |
|  +-----------------------------------+   |
|  | 120x40 | Cursor | Lines           |   | <- info bar
|  +-----------------------------------+   |
+-----------------------------------------+
```

## How It Works

```
+----------------+     +----------------+     +----------------+
|  Raw PTY       | --> |  Zig VT        | --> |  JSON/TUI      |
|  (ANSI bytes)  |     |  Emulator      |     |  Output        |
+----------------+     +----------------+     +----------------+
```

1. **Input** - Raw PTY bytes with ANSI escape sequences
2. **Zig Processing** - Ghostty's VT parser emulates a full terminal
3. **Output** - JSON with styled spans, or rendered in TUI

The Zig library is exposed via N-API for Node.js/Bun:

```typescript
import { ptyToJson } from "ghostty-opentui"

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

## Platform Support

| Platform | Status |
|----------|--------|
| Linux x64 | Full support |
| Linux ARM64 | Full support |
| macOS ARM64 (Apple Silicon) | Full support |
| macOS x64 (Intel) | Full support |
| Windows | Fallback mode (plain text only) |

### Windows Fallback

Windows cannot use the native Zig library due to a **Zig build system bug** with path handling when compiling Ghostty. Instead, Windows uses a fallback that:

- Strips ANSI escape codes using `strip-ansi`
- Returns plain text without colors or styles
- Supports all the same API (cols, rows, limit, offset)

This means Windows users get functional output, just without syntax highlighting. For full color support on Windows, use **WSL** (Windows Subsystem for Linux).

> **Note:** Persistent terminal mode (`persistent: true`) is not available on Windows. If you request persistent mode, the component silently falls back to stateless mode. Methods like `feed()`, `reset()`, `getCursor()`, and `getText()` will throw errors. Use `hasPersistentTerminalSupport()` to check availability at runtime.

## Benchmarks

Performance measured on Apple Silicon (M-series). Run benchmarks with `bun run bench`.

### ptyToJson - Terminal Parsing

| Input Size | ops/s | Latency |
|------------|------:|--------:|
| small (12 chars) | 4,942 | 0.20ms |
| medium (30 lines) | 1,299 | 0.77ms |
| 1K lines | 34 | 29ms |
| 5K lines | 5.5 | 182ms |
| 10K lines | 1.8 | 547ms |
| 20K lines | 0.5 | 1,808ms |

### Early Exit with `limit` Parameter

When `limit` is set, parsing stops early once enough lines are collected. This provides massive speedups for large inputs:

| Input Size | No Limit | With limit=100 | Speedup |
|------------|----------|----------------|--------:|
| 10K lines | 557ms | 3.2ms | **174x** |
| 20K lines | 1,869ms | 6.4ms | **292x** |

This works correctly even with complex terminal output (cursor movement, clear screen, etc.) because we check the actual terminal buffer state, not just input lines.

### Persistent vs Stateless Mode

For streaming scenarios (feeding data in 100 chunks):

| Mode | ops/s | Latency | Speedup |
|------|------:|--------:|--------:|
| Stateless (100 separate ptyToJson calls) | 5.8 | 171ms | 1x |
| Persistent (100 feed() calls) | 34 | 30ms | **5.8x** |

Use `persistent: true` for streaming/interactive terminals for significant performance gains.

### Image Rendering (renderTerminalToImage)

First call includes font load (~35ms one-time). Subsequent calls reuse the cached renderer.

| Terminal size | Format | Warm latency | Output size |
|---------------|--------|-------------:|------------:|
| 80×24 | JPEG | 3ms | 4 KB |
| 80×24 | PNG | 3ms | 5 KB |
| 120×50 | JPEG | 142ms | 267 KB |
| 120×50 | PNG | 123ms | 477 KB |

### Key Insights

- **Use `limit` for large files** - 292x faster for 20K lines with `limit=100`
- **Persistent mode is ~6x faster** for streaming use cases
- **Linear scaling without limit** - 10K lines takes ~10x longer than 1K lines
- **Image rendering scales with terminal size** - 3ms for small, ~130ms for typical TUI

## Requirements

- **Zig 0.15.2** - Required by Ghostty
- **Bun** - For TUI viewer and N-API
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

MIT.
