import { test, expect } from "bun:test"
import { rgbToHex } from "@opentui/core"
import { ptyToJson, type TerminalData } from "./ffi"
import { terminalDataToStyledText } from "./terminal-buffer"

function getLines(data: TerminalData): string[] {
  return data.lines
    .map(line => line.spans.map(s => s.text).join(""))
    .filter(line => line.length > 0)
}

test("import line - single line works", () => {
  const ansi = `\x1b[38;2;197;134;192mimport\x1b[0m { readFileSync } \x1b[38;2;197;134;192mfrom\x1b[0m \x1b[38;2;206;145;120m'fs'\x1b[0m;`
  
  const data = ptyToJson(ansi, { cols: 120, rows: 1, limit: 1 })
  const lines = getLines(data)
  
  expect(lines).toMatchInlineSnapshot(`
    [
      "import { readFileSync } from 'fs';",
    ]
  `)
})

test("newline resets column with linefeed mode", () => {
  const line1 = `\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ cat src/index.ts`
  
  // 35 chars on line 2 - should now fit on one line with linefeed mode enabled
  const chars35 = `${line1}\n${"y".repeat(35)}`
  expect(getLines(ptyToJson(chars35, { cols: 80, rows: 5, limit: 5 }))).toMatchInlineSnapshot(`
    [
      "user@hostname:~/projects/my-app$ cat src/index.ts",
      "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
    ]
  `)
  
  // The original bug case - should now work
  const importLine = `${line1}\n\x1b[38;2;197;134;192mimport\x1b[0m { readFileSync } from 'fs';`
  expect(getLines(ptyToJson(importLine, { cols: 80, rows: 5, limit: 5 }))).toMatchInlineSnapshot(`
    [
      "user@hostname:~/projects/my-app$ cat src/index.ts",
      "import { readFileSync } from 'fs';",
    ]
  `)
})

test("LF now works like CRLF with linefeed mode", () => {
  // LF only (\n) - now resets column with linefeed mode enabled
  const lfOnly = `${"x".repeat(50)}\n${"y".repeat(35)}`
  expect(getLines(ptyToJson(lfOnly, { cols: 80, rows: 5, limit: 5 }))).toMatchInlineSnapshot(`
    [
      "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
    ]
  `)
  
  // CR+LF (\r\n) - still works
  const crlf = `${"x".repeat(50)}\r\n${"y".repeat(35)}`
  expect(getLines(ptyToJson(crlf, { cols: 80, rows: 5, limit: 5 }))).toMatchInlineSnapshot(`
    [
      "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
    ]
  `)
})


