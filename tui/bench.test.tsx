import { describe, expect, it } from "bun:test"
import { ptyToJson } from "./ffi"
import { terminalDataToStyledText } from "./terminal-buffer"
import fs from "fs"

const BENCH_FILE = "/tmp/big.log"
const hasBenchFile = fs.existsSync(BENCH_FILE)

describe.skipIf(!hasBenchFile)("Performance benchmark", () => {
  it("Benchmark ptyToJson + terminalDataToStyledText", async () => {
    const input = fs.readFileSync(BENCH_FILE)

    const zigStart = performance.now()
    const data = ptyToJson(input, { cols: 120, rows: 10000 })
    const zigTime = performance.now() - zigStart

    const styledTextStart = performance.now()
    const styledText = terminalDataToStyledText(data)
    const styledTextTime = performance.now() - styledTextStart

    const totalSpans = data.lines.reduce((acc, l) => acc + l.spans.length, 0)

    console.log(`\n--- BENCHMARK RESULTS ---`)
    console.log(`Total lines: ${data.totalLines}`)
    console.log(`Total spans: ${totalSpans}`)
    console.log(`Total chunks: ${styledText.chunks.length}`)
    console.log(`Zig processing: ${zigTime.toFixed(2)}ms`)
    console.log(`StyledText conversion: ${styledTextTime.toFixed(2)}ms`)
    console.log(`Total: ${(zigTime + styledTextTime).toFixed(2)}ms`)
    console.log(`-------------------------\n`)

    expect(data.totalLines).toBeGreaterThan(0)
  }, 30000)
})
