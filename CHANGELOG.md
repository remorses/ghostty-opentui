# Changelog

## 1.3.0

### Breaking Changes

- **Renamed package** from `opentui-ansi-vt` to `ghostty-opentui`
- **Renamed component** from `terminal-buffer` / `TerminalBufferRenderable` to `ghostty-terminal` / `GhosttyTerminalRenderable`
  - Old names are still available as deprecated aliases for backward compatibility
- **Switched from FFI to N-API** using [napigen](https://github.com/cztomsik/napigen)
  - Native `.node` addon instead of dynamic library with `bun:ffi`
  - Simpler integration with Node.js/Bun
  - No more `bun:ffi` dependency

### Migration Guide

```tsx
// Before
import { TerminalBufferRenderable } from "opentui-ansi-vt/terminal-buffer"
extend({ "terminal-buffer": TerminalBufferRenderable })
<terminal-buffer ansi={ansi} />

// After
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"
extend({ "ghostty-terminal": GhosttyTerminalRenderable })
<ghostty-terminal ansi={ansi} />
```

## 1.2.12

### Features

- **terminal-buffer**: Add `trimEnd` boolean prop to remove trailing empty lines
  - When `trimEnd` is true, empty lines at the end of the output are removed
  - Useful for compact rendering when terminal rows exceed actual content

## 1.2.10

### Bug Fixes

- **dist**: Fix darwin-arm64 binary missing `ptyToText` and `ptyToHtml` symbols

## 1.2.9

### Tests

- **ffi**: Add inline snapshot test for `ptyToHtml` function

## 1.2.6

### Features

- **ffi**: Add `ptyToHtml` function to convert ANSI terminal output to styled HTML
  - Uses ghostty's terminal formatter with `.html` format for accurate rendering
  - Outputs HTML with inline styles for colors and text attributes (bold, italic, underline, etc.)
  - Useful for rendering terminal output in web pages or HTML documents
  - Windows fallback escapes HTML entities and wraps in `<pre>` tags

## 1.2.5

### Optimizations

- **build**: Enable `strip` and `single_threaded` for smaller and faster binaries
  - Strips debug symbols from release builds
  - Removes threading overhead (not needed for PTY parsing)
  - Results in significantly smaller `.so`/`.dylib` files

## 1.2.4

### Features

- **ffi**: Add `ptyToText` function to strip ANSI escape codes and return plain text
  - Uses ghostty's terminal formatter with `.plain` format for accurate ANSI stripping
  - Useful for cleaning terminal output before sending to LLMs or other text processors
  - Handles all ANSI codes including colors, styles (bold/italic/underline), and RGB sequences
  - Windows fallback uses `strip-ansi` package

### Bug Fixes

- **zig**: Set unlimited scrollback to prevent content truncation
  - Both `ptyToJson` and `ptyToText` now use `max_scrollback = maxInt(usize)` 
  - Previously large outputs (>10KB) were truncated from the start
- **ffi**: Call `freeArena()` on error paths to prevent memory accumulation
  - Both `ptyToJson` and `ptyToText` now properly free the arena when returning null

## 1.2.3

### Features

- **terminal-buffer**: Add text highlighting support
  - New `HighlightRegion` interface for specifying highlight regions with `line`, `start`, `end`, `backgroundColor`
  - `replaceWithX` option to mask highlighted text with 'x' characters (useful for testing)
  - `applyHighlightsToLine` function to apply highlights to text chunks
  - `terminalDataToStyledText` now accepts optional `highlights` parameter
  - `TerminalBufferRenderable` now accepts `highlights` option in constructor and as a property
- **tui demo**: Added `findWordHighlights` helper and demo highlighting for ERROR/WARN/SUCCESS words
- **ffi**: Added Windows fallback using `strip-ansi` - returns plain text without colors/styles

## 1.2.2

### Bug Fixes

- **zig**: Disable all logging from ghostty-vt library
  - Suppresses unwanted console messages (e.g., "adjusting page opacity") when using the package

## 1.2.1

### Bug Fixes

- **zig**: Enable linefeed mode to fix newline column reset
  - Lines containing ANSI escape sequences followed by `\n` were wrapping incorrectly
  - Example: `import { readFileSync } from 'fs';` would split as `import { readFileSync } from 'f` + `s';`
  - Root cause: LF (0x0A) only moves cursor down without resetting column in standard VT100 behavior
  - Fix: Enable ghostty's linefeed mode so LF also performs carriage return (column reset)

### Dev Dependencies

- Added `@types/react` for TypeScript type checking
