# Changelog

## 1.4.14

- Fix SVG/resvg image rendering for newer terminal glyphs
  - `renderTerminalToSvg` and `renderTerminalToImage` now position glyphs from Ghostty's exported terminal cell widths instead of stale `wcwidth` widths, fixing Symbols for Legacy Computing, Nerd Font icons, and variation-selector glyphs that were shifted or looked replaced in screenshots.
  - Added geometry rendering for heavy box-drawing half lines such as `╹`, used by opencode prompt/status chrome.

## 1.4.13

- Replace Takumi image rendering with SVG plus resvg-wasm
  - `renderTerminalToImage` now builds a deterministic SVG terminal frame and rasterizes it to PNG with `@resvg/resvg-wasm`
  - Added `renderTerminalToSvg` for callers that want vector output or easier rendering debugging
  - Removed `@takumi-rs/core` and `@takumi-rs/helpers`; bundled font buffers are passed directly to resvg-wasm
  - Image export is now PNG-only, removing the old WebP/JPEG format options
  - Draw common block, box-drawing, braille, and powerline characters as SVG geometry instead of font glyphs
  - Bundle Noto Sans, Noto Sans Symbols, Noto Sans Symbols 2, and Noto Sans CJK SC as fallback fonts for broader Unicode rendering
  - Preserve faint, underline, and strikethrough styles on geometry-rendered glyphs

## 1.4.12

- Honor env-var overrides for bundled font paths
  - Bundled font lookup now honors GHOSTTY_OPENTUI_FONT_PATH and GHOSTTY_OPENTUI_FALLBACK_FONT_PATH env vars, fixing ENOENT errors when running bun --compile-built binaries on machines other than the build host.

## 1.4.11

- Preserve full grapheme clusters in `writeJsonOutput`
  - Cells flagged with `content_tag == .codepoint_grapheme` (ZWJ sequences, VS16 emoji, regional-indicator flag pairs, skin-tone modifiers) used to lose every codepoint past the first, because the exporter wrote only `cell.codepoint()` and never consulted `pin.grapheme(cell)`. Span `width` was correct but `text` was truncated, so consumers rendered just the leading codepoint where the user expected the full cluster.
  - Cell text is now built via a new `appendCellText` helper that writes the base codepoint and then iterates `pin.grapheme(cell)` for any extras.
  - Added a regression test covering VS16, ZWJ, and flag-pair input under mode 2027.

## 1.4.10

- Fix wide-character cell widths being ignored in highlight and cursor rendering
  - `applyHighlightsToLine` and `applyCursorToLine` now track positions using terminal cell widths instead of JS string length
  - Text after double-width characters (CJK, etc.) can now be highlighted and cursored correctly
  - Cell widths measured via `wcwidth` (new dependency), so this works in both Bun and Node.js
  - `convertSpanToChunk` now preserves `span.width` as `cellWidth` on chunks
- Fix CI TypeScript build failure for `wcwidth` import
  - Added `src/wcwidth.d.ts` module declaration so `bun run build` typechecks `import wcwidth from "wcwidth"` without implicit `any` errors

## 1.4.9

- Fix CI stability for `bun test`
  - `src/image.test.ts` now conditionally skips external CLI spawn tests (`opencode`, `claude`) when those executables are not present in `PATH`, while still testing real-command capture with built-in tools (`ls`, `git`)
  - Aligned `@opentui/core` and `@opentui/react` to `0.1.88` to avoid cross-version environment registration conflicts during test bootstrapping
  - Updated `GhosttyTerminalRenderable` to support both `logicalLineInfo.lineStarts` and `logicalLineInfo.lineStartCols`, keeping line-count and scroll-position logic compatible across OpenTUI line-info shapes
  - Updated cursor-style expectations in `terminal-buffer` tests to match current parser output where unset/DECSCUSR-bar scenarios report `block`

## 1.4.8

- Report `"default"` cursor style when no DECSCUSR has been received
  - Persistent terminals track whether the inner application has explicitly set a cursor style; stateless `ptyToJson` compares before/after parsing
  - When no DECSCUSR was sent, JSON reports `cursorStyle: "default"` instead of `"block"`, which maps to opentui's `"default"` style (`\x1b[0 q` — preserve the outer terminal's native cursor)
  - Prevents the Ghostty parser's VT default (`block`) from overriding the user's terminal cursor preference at the shell prompt
- Pass through cursor style from inner applications via DECSCUSR escape sequences
  - The Ghostty terminal parser's `cursor_style` is now included in the JSON output and mapped to opentui cursor styles (`bar` → `line`, `underline` → `underline`, `block`/`block_hollow` → `block`)
  - When `cursorStyle` prop is omitted, `setCursorStyle()` uses the style from the running application (e.g. vim sets underline, shell sets bar)
  - When `cursorStyle` prop is explicitly set, it overrides the terminal's native style
  - Added `focusable` option to `GhosttyTerminalOptions` for non-JSX construction
  - Added tests for cursor style passthrough and override behavior
- Preserve the terminal's native cursor style when `cursorStyle` is not set
  - `cursorStyle` now defaults to `undefined` instead of `"block"`, so `setCursorStyle()` is only called when an explicit style is requested
  - Previously the default `"block"` would override the user's terminal cursor preference (e.g. line/bar) on every render frame
- Respect focus state when rendering terminal cursor via the cursor API
  - When `focusable` is set, cursor rendering is gated on `_focused` so only the focused component claims the terminal cursor (e.g. an unfocused ghostty-terminal alongside a focused textarea won't position the cursor in the wrong pane)
  - Added `focus()` / `blur()` overrides matching opentui's `EditBufferRenderable` pattern
  - Non-focusable instances (the default) are unaffected and continue to show the cursor unconditionally
  - Added tests for focused, unfocused, and blur cursor behavior
- Fix `ghostty-terminal` block cursor appearing too wide in the first and last screen columns
  - `GhosttyTerminalRenderable` now renders the live cursor through the terminal cursor API instead of painting it into `StyledText`
  - Prevents edge-column cursor background bleed while keeping the existing `terminalDataToStyledText(...)` API unchanged
  - Added a regression test that verifies cursor rendering goes through `setCursorStyle(...)` / `setCursorPosition(...)`

## 1.4.7

- Fix cursor not visually advancing when positioned beyond line content
  - `applyCursorToLine` now pads with spaces when the cursor column exceeds the line's text length, so cursor movements without character writes (e.g. typing spaces in vi insert mode through tmux) produce distinct rendered output and trigger screen updates
- Fix `PersistentTerminal` corrupting split UTF-8 `Buffer` / `Uint8Array` input across `feed()` calls
  - `PersistentTerminal.feed()` now uses a persistent `TextDecoder` with streaming mode, so multibyte code points survive PTY chunk boundaries
  - String feeds and `reset()` now recreate that streaming decoder, discarding any partial binary state instead of carrying extra decoder bookkeeping
  - `ptyToJson`, `ptyToText`, and `ptyToHtml` now share a consistent UTF-8 decode path for binary input
  - `ghostty-terminal` typings now accept `Uint8Array` for `ansi` and `feed()`
  - Added tests covering split multibyte `Buffer` and `Uint8Array` feeds
- Fix trailing styled empty cells being trimmed from JSON output
  - `writeJsonOutput()` now keeps end-of-line cells that have no codepoint but do carry styling, such as background colors produced by `EL` / erase-to-end-of-line sequences
  - Preserves full-width colored prompt and status bars instead of truncating them at the last non-empty character
- Fix INVERSE text becoming invisible when the original background color is unset
  - `convertSpanToChunk` now falls back to the default terminal background instead of the default foreground when swapping colors for the `INVERSE` flag
  - Restores correct rendering for TUIs like `nano` where inverted text was previously rendered with identical foreground and background colors

## 1.4.5

- Fix `screenshot` command failing under Node.js ESM: `Cannot find module './ffi'` in `dist/image.js`
  - Added missing `.js` extensions to relative imports in `src/image.ts` — Node.js ESM requires explicit extensions, Bun was lenient
  - Also fixed extensions in all test/bench files for consistency
  - Added AGENTS.md rule to always use `.js` in relative imports (tsconfig can't enforce this because `@opentui/core` doesn't resolve under NodeNext)

## 1.4.4

- **`frameColor` option** for `renderTerminalToImage` / `renderTerminalToPaginatedImages` — sets the color of the padding/frame area around the terminal content
  - When `paddingX`/`paddingY` > 0 and no `frameColor` is given, auto-detects the dominant background color from edge cells so the frame blends with the app's chrome
  - When `frameColor` differs from `theme.background`, content is wrapped in an inner container preserving the terminal background while the outer area shows the frame color
- **Padding defaults changed to 0** — `paddingX` and `paddingY` now default to `0` (previously 24/20px); tuistory CLI handles padding with its own `--padding` flag
- **Symbols Nerd Font Mono** bundled as a second fallback font alongside JetBrains Mono Nerd for broader Unicode glyph coverage (replaces the Noto Sans Symbols 2 approach from 1.4.3)
  - `fontFamily` updated to `JetBrains Mono Nerd, Symbols Nerd Font Mono, monospace`

## 1.4.3

- Fix missing `◼` (`U+25FC`) glyphs in image output when rendering heatmap-style content
  - `renderTerminalToImage`: load bundled `Noto Sans Symbols 2` as a fallback font alongside JetBrains Mono Nerd
  - `renderTerminalToPaginatedImages`: uses the same renderer initialization, so fallback applies to paginated exports too
  - Update root image `fontFamily` to `JetBrains Mono Nerd, Noto Sans Symbols 2, monospace` for deterministic Unicode symbol fallback

## 1.4.2

- Fix `devicePixelRatio` producing clipped/same-size images instead of higher resolution output
  - The renderer uses `width`/`height` as the output canvas size — `devicePixelRatio` only affects layout computation
  - Now multiplies render dimensions by the ratio: `width * dpr`, `height * dpr`
  - A `devicePixelRatio: 2` render now correctly produces an image with 2x pixel dimensions

## 1.4.1

- Add `devicePixelRatio` option to `RenderImageOptions` for HiDPI/retina screenshot rendering
  - Forwarded to `@takumi-rs/core` `renderer.render()` in both `renderTerminalToImage` and `renderTerminalToPaginatedImages`
  - Use `devicePixelRatio: 2` for sharp images on social media and messaging apps

## 1.4.0

- **Terminal-to-image rendering** via new `ghostty-opentui/image` export
  - `renderTerminalToImage(data, options)` — converts `TerminalData` to PNG/WebP/JPEG buffer
  - `renderTerminalToPaginatedImages(data, options)` — splits long content into multiple images
  - Uses `@takumi-rs/core` (Rust CSS renderer) with bundled JetBrains Mono Nerd font
  - Fixed-width character grid: each span snaps to `span.width * charWidth` pixels, preventing glyph drift with box-drawing and block characters
  - Configurable font size (default 14px), line height, padding, theme colors, output format
  - Auto-calculates image width from terminal columns
- **Testdata fixes**: restored missing ESC bytes in 8 `.log` files, fixed table header alignment
- **Bug fix**: `trimTrailingEmptyLines` now preserves lines with background colors or INVERSE flag (TUI status bars)
- `@takumi-rs/core` and `@takumi-rs/helpers` added as optional dependencies
- `public/jetbrains-mono-nerd.ttf` bundled and shipped with package

## 1.3.13

- Fix cursor rendered on wrong line when scrollback exists in persistent mode (#4)
  - `data.cursor[1]` is screen-relative but was used directly as line index into `data.lines`
  - Now adjusted with `(totalLines - rows) + cursor[1] - offset`

## 1.3.11

- Remove ghostty submodule, fetch as zig dependency instead

## 1.3.10

- Fixed Windows binary - now included and tested via Node.js (Bun has a bug loading .node on Windows)

## 1.3.9

### Features

- **platform support**: Add cross-compiled native binaries for 5 platforms
  - Linux: `x64`, `arm64`
  - macOS: `arm64`, `x64`
  - Windows: `x64` (cross-compiled from macOS)
- **build**: Add `scripts/build.ts` for local cross-compilation of all targets
  - Uses Zig's cross-compilation to build all platforms from a single machine
  - Run `bun scripts/build.ts` to build all, or `bun scripts/build.ts darwin-arm64` for specific target
- **ci**: Simplified CI to cross-compile all targets from ubuntu, test on Linux and Windows

## 1.3.8

### Performance

- **zig**: Add early exit optimization for `limit` parameter
  - When `limit` is set, parsing stops once enough lines are collected
  - 10K lines with `limit=100`: 557ms → 3.2ms (**174x faster**)
  - 20K lines with `limit=100`: 1,869ms → 6.4ms (**292x faster**)
  - Works correctly with cursor movement, clear screen, and other complex escape sequences

### Documentation

- Add benchmarks section to README with performance numbers
- Add vitest benchmark suite (`bun run bench`)
  - Tests ptyToJson, ptyToText, ptyToHtml at various input sizes
  - Compares persistent vs stateless terminal modes
  - Tests pagination with offset/limit

## 1.3.7

### Bug Fixes

- **zig**: Fix ANSI escape sequences split across PTY data chunks
  - `PersistentTerminal` was creating a new VT stream for every `feed()` call, losing parser state between calls
  - When ANSI sequences were split across multiple data chunks (common with streaming PTY data), partial sequences appeared as literal characters like `[38;`, `m`, `;27H` in the output
  - Fix: Store the stream persistently and reuse it across `feed()` calls, preserving parser state

### Features

- **ffi**: Add `isReady()` method to `PersistentTerminal`
  - Returns `true` if parser is in ground state (all escape sequences fully processed)
  - Use after `feed()` to ensure you're not reading partial terminal state

## 1.3.6

### Features

- **ESM support**: Package now uses `"type": "module"` for native ESM output
  - All `.ts` files compile to ESM (`.js`)
  - Native module loader kept as CommonJS (`native-lib.cjs`) for `require()` compatibility with `.node` files
  - Added `bun` export condition to run directly from TypeScript source

### Changes

- Updated tsconfig to use `module: "ESNext"` and `moduleResolution: "Bundler"`
- Removed top-level `main` and `types` fields in favor of `exports` map

## 1.3.1

### Bug Fixes

- **zig**: Fix memory leak in all NAPI string-returning functions
  - `ptyToJson`, `ptyToText`, `ptyToHtml`, `getTerminalJson`, `getTerminalText`, `getTerminalCursor` were leaking memory on every call
  - Each call allocated with `page_allocator.dupe()` but never freed after napigen copied to JS
  - Fix: Reset arena at the START of each call instead of at the end, allowing returned slice to survive until napigen copies it
- **terminal-buffer**: Fix persistent terminal not being destroyed on component unmount
  - Override `destroy()` method to properly call `super.destroy()` and clean up native terminal resources

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
