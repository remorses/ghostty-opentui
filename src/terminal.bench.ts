import { bench, describe } from "vitest"
import { ptyToJson, ptyToText, PersistentTerminal, hasPersistentTerminalSupport } from "./ffi"
import fs from "fs"

// =============================================================================
// Test Data Generation
// =============================================================================

// Small: simple colored text
const SMALL_ANSI = "\x1b[32mHello\x1b[0m \x1b[1;31mWorld\x1b[0m!"

// Medium: typical terminal output (like ls -la)
const MEDIUM_ANSI = fs.existsSync("testdata/session.log")
  ? fs.readFileSync("testdata/session.log", "utf-8")
  : generateMediumAnsi()

function generateMediumAnsi(): string {
  const lines: string[] = []
  for (let i = 0; i < 30; i++) {
    const color = 31 + (i % 7)
    lines.push(`\x1b[${color}mdrwxr-xr-x\x1b[0m  10 user user  4096 Dec 22 10:${String(i).padStart(2, "0")} \x1b[1;34mfolder_${i}\x1b[0m`)
  }
  return lines.join("\n")
}

// Large: 1000+ lines with various ANSI codes
function generateLargeAnsi(lineCount: number): string {
  const lines: string[] = []
  for (let i = 0; i < lineCount; i++) {
    const color = 31 + (i % 7)
    const bold = i % 3 === 0 ? "1;" : ""
    const underline = i % 5 === 0 ? "4;" : ""
    lines.push(
      `\x1b[${bold}${underline}${color}m[${String(i).padStart(4, "0")}]\x1b[0m ` +
      `This is line number ${i} with \x1b[33mhighlighted\x1b[0m text and ` +
      `\x1b[48;5;${17 + (i % 20)}m\x1b[38;5;${232 + (i % 10)}msome background\x1b[0m content.`
    )
  }
  return lines.join("\n")
}

const LARGE_ANSI_1K = generateLargeAnsi(1000)
const LARGE_ANSI_5K = generateLargeAnsi(5000)
const LARGE_ANSI_10K = generateLargeAnsi(10000)

// Very large: stress test (20K lines for reasonable bench time)
const HUGE_ANSI = generateLargeAnsi(20000)

// =============================================================================
// Benchmarks: ptyToJson (Zig terminal processing)
// =============================================================================

describe("ptyToJson - Terminal Parsing", () => {
  bench("small (12 chars)", () => {
    ptyToJson(SMALL_ANSI, { cols: 80, rows: 24 })
  })

  bench("medium (~2KB, 30 lines)", () => {
    ptyToJson(MEDIUM_ANSI, { cols: 120, rows: 100 })
  })

  bench("large (1K lines)", () => {
    ptyToJson(LARGE_ANSI_1K, { cols: 120, rows: 2000 })
  })

  bench("large (5K lines)", () => {
    ptyToJson(LARGE_ANSI_5K, { cols: 120, rows: 6000 })
  })

  bench("large (10K lines)", () => {
    ptyToJson(LARGE_ANSI_10K, { cols: 120, rows: 12000 })
  })
})

// =============================================================================
// Benchmarks: ptyToText (Plain text extraction)
// =============================================================================

describe("ptyToText - Plain Text Extraction", () => {
  bench("small", () => {
    ptyToText(SMALL_ANSI)
  })

  bench("medium", () => {
    ptyToText(MEDIUM_ANSI)
  })

  bench("large (1K lines)", () => {
    ptyToText(LARGE_ANSI_1K)
  })

  bench("large (5K lines)", () => {
    ptyToText(LARGE_ANSI_5K)
  })
})

// =============================================================================
// Benchmarks: Persistent vs Non-Persistent Terminal
// =============================================================================

describe.skipIf(!hasPersistentTerminalSupport())("Persistent vs Stateless Mode", () => {
  // Simulate streaming: feed data in chunks
  const CHUNK_COUNT = 100
  const CHUNK_SIZE = 10 // lines per chunk
  const chunks: string[] = []
  for (let i = 0; i < CHUNK_COUNT; i++) {
    chunks.push(generateLargeAnsi(CHUNK_SIZE))
  }

  bench("stateless: 100 separate ptyToJson calls", () => {
    // Each call creates and destroys a terminal
    for (const chunk of chunks) {
      ptyToJson(chunk, { cols: 120, rows: 2000 })
    }
  })

  bench("persistent: 100 feed() calls to single terminal", () => {
    const term = new PersistentTerminal({ cols: 120, rows: 2000 })
    for (const chunk of chunks) {
      term.feed(chunk)
    }
    term.getJson()
    term.destroy()
  })

  bench("persistent: create + feed + getJson + destroy cycle", () => {
    const term = new PersistentTerminal({ cols: 120, rows: 100 })
    term.feed(MEDIUM_ANSI)
    term.getJson()
    term.destroy()
  })
})

// =============================================================================
// Benchmarks: Pagination/Offset (for virtual scrolling)
// =============================================================================

describe("Pagination - Offset & Limit", () => {
  bench("large (10K) - no pagination", () => {
    ptyToJson(LARGE_ANSI_10K, { cols: 120, rows: 12000 })
  })

  bench("large (10K) - first 100 lines", () => {
    ptyToJson(LARGE_ANSI_10K, { cols: 120, rows: 12000, offset: 0, limit: 100 })
  })

  bench("large (10K) - middle 100 lines", () => {
    ptyToJson(LARGE_ANSI_10K, { cols: 120, rows: 12000, offset: 5000, limit: 100 })
  })

  bench("large (10K) - last 100 lines", () => {
    ptyToJson(LARGE_ANSI_10K, { cols: 120, rows: 12000, offset: 9900, limit: 100 })
  })
})

// =============================================================================
// Stress Test
// =============================================================================

describe("Stress Test", () => {
  bench("huge (20K lines) - full parse", () => {
    ptyToJson(HUGE_ANSI, { cols: 120, rows: 25000 })
  }, { warmupIterations: 1, iterations: 5 })

  bench("huge (20K lines) - with limit 100", () => {
    ptyToJson(HUGE_ANSI, { cols: 120, rows: 25000, limit: 100 })
  }, { warmupIterations: 1, iterations: 5 })
})
