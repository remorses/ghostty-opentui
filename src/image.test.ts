// Tests for terminal-to-image rendering.
// Each test generates an actual image and saves it to testdata/images/ for visual inspection.

import { describe, it, expect, beforeAll } from "bun:test"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { ptyToJson, PersistentTerminal, type TerminalData } from "./ffi.js"
import { renderTerminalToImage, renderTerminalToPaginatedImages, renderTerminalToSvg } from "./image.js"

const TESTDATA_DIR = join(import.meta.dirname, "..", "testdata")
const IMAGES_DIR = join(TESTDATA_DIR, "images")

// PNG magic bytes
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function isPng(buffer: Buffer): boolean {
  return buffer.subarray(0, 8).equals(PNG_HEADER)
}

function readTestData(filename: string): string {
  return readFileSync(join(TESTDATA_DIR, filename), "utf-8")
}

function saveImage(name: string, buffer: Buffer, ext: string = "png"): string {
  const path = join(IMAGES_DIR, `${name}.${ext}`)
  writeFileSync(path, buffer)
  return path
}

function isCommandAvailable(command: string): boolean {
  return Bun.which(command) !== null
}

beforeAll(() => {
  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true })
  }
})

// ─────────────────────────────────────────────────────────────
// Testdata file renders
// ─────────────────────────────────────────────────────────────

describe("testdata renders", () => {
  it("git-status.log — colored git output", async () => {
    const ansi = readTestData("git-status.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 24 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    expect(image.length).toBeGreaterThan(1000)
    saveImage("git-status", image)
  })

  it("diff.log — red/green diff lines", async () => {
    const ansi = readTestData("diff.log")
    const data = ptyToJson(ansi, { cols: 100, rows: 30 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("diff", image)
  })

  it("colors.log — basic ANSI colors", async () => {
    const ansi = readTestData("colors.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 10 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("colors", image)
  })

  it("256colors.log — 256-color palette", async () => {
    const ansi = readTestData("256colors.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 24 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("256colors", image)
  })

  it("truecolor.log — 24-bit RGB colors", async () => {
    const ansi = readTestData("truecolor.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 10 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("truecolor", image)
  })

  it("styles.log — bold, italic, underline, faint", async () => {
    const ansi = readTestData("styles.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 10 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("styles", image)
  })

  it("table.log — box-drawing table", async () => {
    const ansi = readTestData("table.log")
    const data = ptyToJson(ansi, { cols: 60, rows: 20 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("table", image)
  })

  it("tree.log — file tree with box chars", async () => {
    const ansi = readTestData("tree.log")
    const data = ptyToJson(ansi, { cols: 60, rows: 20 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("tree", image)
  })

  it("vitest.log — test runner output", async () => {
    const ansi = readTestData("vitest.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 30 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("vitest", image)
  })

  it("logs.log — log output", async () => {
    const ansi = readTestData("logs.log")
    const data = ptyToJson(ansi, { cols: 100, rows: 30 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("logs", image)
  })

  it("session.log — shell session", async () => {
    const ansi = readTestData("session.log")
    const data = ptyToJson(ansi, { cols: 120, rows: 40 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("session", image)
  })

  it("backgrounds.log — background colors", async () => {
    const ansi = readTestData("backgrounds.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 10 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("backgrounds", image)
  })
})



// ─────────────────────────────────────────────────────────────
// Options and edge cases
// ─────────────────────────────────────────────────────────────

describe("rendering options", () => {
  it("custom theme — light background", async () => {
    const ansi = readTestData("diff.log")
    const data = ptyToJson(ansi, { cols: 100, rows: 30 })
    const image = await renderTerminalToImage(data, {
      theme: { background: "#ffffff", text: "#24292e" },
    })

    expect(isPng(image)).toBe(true)
    saveImage("diff-light-theme", image)
  })

  it("larger font size — 20px", async () => {
    const ansi = readTestData("git-status.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 24 })
    const image = await renderTerminalToImage(data, {
      fontSize: 20,
      lineHeight: 1.6,
    })

    expect(isPng(image)).toBe(true)
    saveImage("git-status-large", image)
  })

  it("fixed width — 1200px", async () => {
    const ansi = readTestData("table.log")
    const data = ptyToJson(ansi, { cols: 60, rows: 20 })
    const image = await renderTerminalToImage(data, {
      width: 1200,
    })

    expect(isPng(image)).toBe(true)
    saveImage("table-1200w", image)
  })

  it("fixed height — clips content", async () => {
    const ansi = readTestData("vitest.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 30 })
    const image = await renderTerminalToImage(data, {
      height: 200,
    })

    expect(isPng(image)).toBe(true)
    saveImage("vitest-clipped", image)
  })

  it("svg output — deterministic vector terminal frame", () => {
    const data = ptyToJson("\x1b[32mOK\x1b[0m \x1b[7mINV\x1b[0m", { cols: 10, rows: 1 })
    const svg = renderTerminalToSvg(data, {
      width: 100,
      fontSize: 10,
      lineHeight: 1.4,
      theme: { background: "#000000", text: "#ffffff" },
    })

    expect(svg.replaceAll("><", ">\n<")).toMatchInlineSnapshot(`
"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="14" viewBox="0 0 100 14">
<rect x="0" y="0" width="100" height="14" fill="#000000"/>
<rect x="0" y="0" width="100" height="14" fill="#000000"/>
<rect x="0" y="0" width="100" height="14" fill="#000000"/>
<text x="0" y="9.8" fill="#b5bd68" font-family="JetBrainsMono Nerd Font, Symbols Nerd Font Mono, Noto Sans, Noto Sans Symbols, Noto Sans Symbols2, Noto Sans CJK SC, monospace" font-size="10" xml:space="preserve">OK</text>
<text x="12" y="9.8" fill="#ffffff" font-family="JetBrainsMono Nerd Font, Symbols Nerd Font Mono, Noto Sans, Noto Sans Symbols, Noto Sans Symbols2, Noto Sans CJK SC, monospace" font-size="10" xml:space="preserve"> </text>
<rect x="18" y="0" width="18" height="14" fill="#000000"/>
<text x="18" y="9.8" fill="#ffffff" font-family="JetBrainsMono Nerd Font, Symbols Nerd Font Mono, Noto Sans, Noto Sans Symbols, Noto Sans Symbols2, Noto Sans CJK SC, monospace" font-size="10" xml:space="preserve">INV</text>
</svg>"
`)
  })

  it("svg output — draws terminal glyphs as geometry", () => {
    const data = ptyToJson("┌─┐\n│█│\n└⠿", { cols: 4, rows: 3 })
    const svg = renderTerminalToSvg(data, {
      fontSize: 10,
      lineHeight: 1,
      theme: { background: "#000000", text: "#ffffff" },
    })

    expect(svg.replaceAll("><", ">\n<")).toMatchInlineSnapshot(`
"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"30\" viewBox=\"0 0 24 30\">
<rect x=\"0\" y=\"0\" width=\"24\" height=\"30\" fill=\"#000000\"/>
<rect x=\"0\" y=\"0\" width=\"24\" height=\"30\" fill=\"#000000\"/>
<rect x=\"0\" y=\"0\" width=\"24\" height=\"10\" fill=\"#000000\"/>
<line x1=\"3\" y1=\"5\" x2=\"6\" y2=\"5\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<line x1=\"3\" y1=\"5\" x2=\"3\" y2=\"10\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<line x1=\"9\" y1=\"5\" x2=\"12\" y2=\"5\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<line x1=\"6\" y1=\"5\" x2=\"9\" y2=\"5\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<line x1=\"15\" y1=\"5\" x2=\"15\" y2=\"10\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<line x1=\"12\" y1=\"5\" x2=\"15\" y2=\"5\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<rect x=\"0\" y=\"10\" width=\"24\" height=\"10\" fill=\"#000000\"/>
<line x1=\"3\" y1=\"10\" x2=\"3\" y2=\"15\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<line x1=\"3\" y1=\"15\" x2=\"3\" y2=\"20\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<rect x=\"6\" y=\"10\" width=\"6\" height=\"10\" fill=\"#ffffff\"/>
<line x1=\"15\" y1=\"10\" x2=\"15\" y2=\"15\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<line x1=\"15\" y1=\"15\" x2=\"15\" y2=\"20\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<rect x=\"0\" y=\"20\" width=\"24\" height=\"10\" fill=\"#000000\"/>
<line x1=\"3\" y1=\"20\" x2=\"3\" y2=\"25\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<line x1=\"3\" y1=\"25\" x2=\"6\" y2=\"25\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
<circle cx=\"7.92\" cy=\"21.8\" r=\"1\" fill=\"#ffffff\"/>
<circle cx=\"7.92\" cy=\"24\" r=\"1\" fill=\"#ffffff\"/>
<circle cx=\"7.92\" cy=\"26.2\" r=\"1\" fill=\"#ffffff\"/>
<circle cx=\"10.08\" cy=\"21.8\" r=\"1\" fill=\"#ffffff\"/>
<circle cx=\"10.08\" cy=\"24\" r=\"1\" fill=\"#ffffff\"/>
<circle cx=\"10.08\" cy=\"26.2\" r=\"1\" fill=\"#ffffff\"/>
<path d=\"M 12 20 L 18 25 L 12 30 Z\" fill=\"#ffffff\"/>
</svg>"
`)
  })

  it("svg output — keeps style flags on geometry glyphs", () => {
    const data = ptyToJson("\x1b[2;4m█\x1b[0m", { cols: 1, rows: 1 })
    const svg = renderTerminalToSvg(data, {
      fontSize: 10,
      lineHeight: 1,
      theme: { background: "#000000", text: "#ffffff" },
    })

    expect(svg.replaceAll("><", ">\n<")).toMatchInlineSnapshot(`
"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"6\" height=\"10\" viewBox=\"0 0 6 10\">
<rect x=\"0\" y=\"0\" width=\"6\" height=\"10\" fill=\"#000000\"/>
<rect x=\"0\" y=\"0\" width=\"6\" height=\"10\" fill=\"#000000\"/>
<rect x=\"0\" y=\"0\" width=\"6\" height=\"10\" fill=\"#000000\"/>
<g opacity=\"0.5\">
<rect x=\"0\" y=\"0\" width=\"6\" height=\"10\" fill=\"#ffffff\"/>
<line x1=\"0\" y1=\"8.6\" x2=\"6\" y2=\"8.6\" stroke=\"#ffffff\" stroke-width=\"1\" stroke-linecap=\"butt\"/>
</g>
</svg>"
`)
  })

  it("unicode fallback fonts — CJK and symbols", async () => {
    const data = ptyToJson("Latin Ελληνικά Кириллица\nCJK 你好 日本語 한국어\nSymbols ∑ ∫ ⌘ ⚙ ☂", { cols: 60, rows: 3 })
    const image = await renderTerminalToImage(data, {
      fontSize: 18,
      lineHeight: 1.3,
      paddingX: 12,
      paddingY: 10,
    })

    expect(isPng(image)).toBe(true)
    expect(image.length).toBeGreaterThan(1000)
    saveImage("unicode-fallback", image)
  })
})

describe("paginated rendering", () => {
  it("splits long content into multiple images", async () => {
    // Create long content by repeating session.log data
    const ansi = readTestData("session.log")
    const data = ptyToJson(ansi, { cols: 120, rows: 200 })

    const result = await renderTerminalToPaginatedImages(data, {
      maxLinesPerImage: 10,
    })

    expect(result.imageCount).toBeGreaterThanOrEqual(1)
    expect(result.images.length).toBe(result.imageCount)
    expect(result.paths.length).toBe(result.imageCount)

    // Save first and last page
    if (result.images[0]) {
      expect(isPng(result.images[0])).toBe(true)
      saveImage("paginated-page-1", result.images[0])
    }
    if (result.imageCount > 1 && result.images[result.imageCount - 1]) {
      saveImage("paginated-page-last", result.images[result.imageCount - 1]!)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Real command spawns — capture actual terminal output as images
// ─────────────────────────────────────────────────────────────

/** Spawn a command in a PTY via Bun.spawn terminal API, feed into PersistentTerminal, return TerminalData */
async function spawnAndCapture(
  command: string,
  args: string[],
  options: { cols?: number; rows?: number; waitMs?: number; idleMs?: number; env?: Record<string, string> } = {},
): Promise<TerminalData> {
  const cols = options.cols ?? 120
  const rows = options.rows ?? 40
  const waitMs = options.waitMs ?? 5000
  const idleMs = options.idleMs ?? 500

  const term = new PersistentTerminal({ cols, rows })

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  Object.assign(env, options.env, {
    TERM: "xterm-truecolor",
    COLORTERM: "truecolor",
  })

  let done = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let idleResolve: (() => void) | undefined
  const idlePromise = new Promise<void>((resolve) => {
    idleResolve = resolve
  })

  const proc = Bun.spawn([command, ...args], {
    env,
    terminal: {
      cols,
      rows,
      data(_terminal: any, data: any) {
        if (done) return
        const str = typeof data === "string" ? data : new TextDecoder().decode(data)
        term.feed(str)
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => idleResolve?.(), idleMs)
      },
    },
  })

  // Wait for content to stabilize or timeout
  await Promise.race([
    idlePromise,
    new Promise<void>((resolve) => setTimeout(resolve, waitMs)),
  ])

  done = true
  const terminalData = term.getJson()

  proc.kill()
  term.destroy()

  return terminalData
}

describe("real command spawns", () => {
  const itIfOpencodeAvailable = isCommandAvailable("opencode") ? it : it.skip
  const itIfClaudeAvailable = isCommandAvailable("claude") ? it : it.skip

  itIfOpencodeAvailable("opencode — interactive TUI (snapshot after launch)", async () => {
    // opencode sends initial escape sequences at ~500ms, then renders UI at ~1500ms.
    // Need idleMs > 1000ms gap between first data and actual UI render.
    const data = await spawnAndCapture("opencode", [], {
      cols: 120,
      rows: 40,
      waitMs: 6000,
      idleMs: 2000,
    })

    const image = await renderTerminalToImage(data)
    expect(isPng(image)).toBe(true)
    expect(image.length).toBeGreaterThan(1000)
    saveImage("opencode", image)
  }, 15000)

  itIfOpencodeAvailable("opencode --help", async () => {
    const data = await spawnAndCapture("opencode", ["--help"], {
      cols: 100,
      rows: 40,
      waitMs: 5000,
    })

    const image = await renderTerminalToImage(data)
    expect(isPng(image)).toBe(true)
    expect(image.length).toBeGreaterThan(1000)
    saveImage("opencode-help", image)
  }, 15000)

  itIfClaudeAvailable("claude --help", async () => {
    const data = await spawnAndCapture("claude", ["--help"], {
      cols: 100,
      rows: 50,
      waitMs: 5000,
    })

    const image = await renderTerminalToImage(data)
    expect(isPng(image)).toBe(true)
    expect(image.length).toBeGreaterThan(1000)
    saveImage("claude-help", image)
  }, 15000)

  it("ls with colors", async () => {
    const data = await spawnAndCapture("ls", ["-la", "--color=always"], {
      cols: 100,
      rows: 40,
      waitMs: 3000,
    })

    const image = await renderTerminalToImage(data)
    expect(isPng(image)).toBe(true)
    saveImage("ls-color", image)
  }, 10000)

  it("git log with colors", async () => {
    const data = await spawnAndCapture(
      "git",
      ["log", "--oneline", "--graph", "--color=always", "-20"],
      { cols: 120, rows: 30, waitMs: 3000 },
    )

    const image = await renderTerminalToImage(data)
    expect(isPng(image)).toBe(true)
    saveImage("git-log", image)
  }, 10000)

  it("git diff with colors", async () => {
    const data = await spawnAndCapture(
      "git",
      ["diff", "--color=always", "HEAD~1"],
      { cols: 120, rows: 50, waitMs: 3000 },
    )

    const image = await renderTerminalToImage(data)
    expect(isPng(image)).toBe(true)
    saveImage("git-diff-real", image)
  }, 10000)
})

describe("edge cases", () => {
  it("empty terminal — throws", async () => {
    const data = ptyToJson("", { cols: 80, rows: 24 })
    await expect(renderTerminalToImage(data)).rejects.toThrow("No content to render")
  })

  it("single character", async () => {
    const data = ptyToJson("X", { cols: 80, rows: 1 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("single-char", image)
  })

  it("inverse video", async () => {
    const ansi = "\x1b[7mINVERSE\x1b[0m normal \x1b[1;7mBOLD INVERSE\x1b[0m"
    const data = ptyToJson(ansi, { cols: 60, rows: 3 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("inverse-video", image)
  })

  it("combined styles — bold + italic + color", async () => {
    const ansi = readTestData("combined.log")
    const data = ptyToJson(ansi, { cols: 80, rows: 10 })
    const image = await renderTerminalToImage(data)

    expect(isPng(image)).toBe(true)
    saveImage("combined-styles", image)
  })

  it("empty lines with background — should not be trimmed", async () => {
    const ansi = "Line 1\nLine 2\n\x1b[44m          \x1b[0m"
    const data = ptyToJson(ansi, { cols: 20, rows: 3 })
    const image = await renderTerminalToImage(data)
    
    // We expect 3 lines visible
    expect(data.lines.length).toBe(3)
    // Image should be generated successfully
    expect(isPng(image)).toBe(true)
    saveImage("bg-lines-preserved", image)
  })
})
