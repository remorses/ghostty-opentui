import { createCliRenderer, type ScrollBoxRenderable } from "@opentui/core"
import { createRoot, useKeyboard, extend } from "@opentui/react"
import { useState, useRef, useMemo } from "react"
import { GhosttyTerminalRenderable, type HighlightRegion } from "./terminal-buffer"
import { ptyToJson } from "./ffi"

// Register the ghostty-terminal component
extend({ "ghostty-terminal": GhosttyTerminalRenderable })

/**
 * Finds all occurrences of a word in the terminal output and returns highlight regions.
 * Searches through the rendered terminal lines (after ANSI parsing).
 */
function findWordHighlights(
  ansi: string | Buffer,
  word: string,
  backgroundColor: string,
  cols = 120,
  rows = 120,
): HighlightRegion[] {
  const data = ptyToJson(ansi, { cols, rows })
  const highlights: HighlightRegion[] = []

  for (let lineIdx = 0; lineIdx < data.lines.length; lineIdx++) {
    const line = data.lines[lineIdx]
    // Build the plain text for this line
    const lineText = line.spans.map((s) => s.text).join("")
    
    // Find all occurrences of the word in this line
    let pos = 0
    while (true) {
      const idx = lineText.indexOf(word, pos)
      if (idx === -1) break
      
      highlights.push({
        line: lineIdx,
        start: idx,
        end: idx + word.length,
        backgroundColor,
      })
      pos = idx + 1
    }
  }

  return highlights
}

export function TerminalView({ ansi }: { ansi: string | Buffer }) {
  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <scrollbox
        focused
        padding={3}
        style={{ flexGrow: 1 }}
      >
        <ghostty-terminal ansi={ansi} cols={120} rows={120} />
      </scrollbox>
    </box>
  )
}

function App({ initialAnsi }: { initialAnsi: string | Buffer }) {
  const [ansi, setAnsi] = useState(initialAnsi)
  const [count, setCount] = useState(0)
  const scrollBoxRef = useRef<ScrollBoxRenderable>(null)
  const terminalBufferRef = useRef<GhosttyTerminalRenderable>(null)

  // Find and highlight specific words in the terminal output
  const highlights = useMemo(() => {
    return [
      ...findWordHighlights(ansi, "ERROR", "#664400"),   // Dark yellow/orange for ERROR
      ...findWordHighlights(ansi, "WARN", "#665500"),    // Slightly different yellow for WARN
      ...findWordHighlights(ansi, "SUCCESS", "#006622"), // Dark green for SUCCESS
    ]
  }, [ansi])

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      process.exit(0)
    }
    if (key.name === "p") {
      const prefix = `\x1b[1;35m[PREFIX ${count + 1}]\x1b[0m\n`
      setAnsi(prefix + ansi)
      setCount(count + 1)
    }
    if (key.name === "t") {
      // Scroll to top
      if (scrollBoxRef.current) {
        scrollBoxRef.current.scrollTo(0)
      }
    }
    if (key.name === "b") {
      // Scroll to bottom
      if (scrollBoxRef.current && terminalBufferRef.current) {
        const lastLine = terminalBufferRef.current.lineCount - 1
        const scrollPos = terminalBufferRef.current.getScrollPositionForLine(lastLine)
        scrollBoxRef.current.scrollTo(scrollPos)
      }
    }
    if (key.name === "1" || key.name === "2" || key.name === "3") {
      // Scroll to specific lines in the output
      if (scrollBoxRef.current && terminalBufferRef.current) {
        const lineMap: Record<string, number> = {
          "1": 10,  // Line 10
          "2": 50,  // Line 50
          "3": 100, // Line 100
        }
        const targetLine = lineMap[key.name]
        const scrollPos = terminalBufferRef.current.getScrollPositionForLine(targetLine)
        scrollBoxRef.current.scrollTo(scrollPos)
      }
    }
  })

  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <box style={{ height: 3, paddingLeft: 1, marginBottom: 1, flexDirection: "column" }}>
        <text fg="#8b949e">Press 'p' to add prefix | 't' top | 'b' bottom | '1' line 10 | '2' line 50 | '3' line 100</text>
        <text fg="#8b949e">Press 'q' to quit | Prefix count: {count} | Lines: {terminalBufferRef.current?.lineCount ?? 0}</text>
        <text fg="#8b949e">Highlights: <span bg="#664400">ERROR</span> <span bg="#665500">WARN</span> <span bg="#006622">SUCCESS</span> ({highlights.length} found)</text>
      </box>
      <scrollbox
        ref={scrollBoxRef}
        focused
        padding={3}
        style={{ flexGrow: 1 }}
      >
        <ghostty-terminal ref={terminalBufferRef} ansi={ansi} cols={120} rows={120} highlights={highlights} />
      </scrollbox>
    </box>
  )
}

const SAMPLE_ANSI = `\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ ls -la
total 128
drwxr-xr-x  12 user user  4096 Nov 26 10:30 \x1b[1;34m.\x1b[0m
drwxr-xr-x   5 user user  4096 Nov 25 14:22 \x1b[1;34m..\x1b[0m
-rw-r--r--   1 user user   234 Nov 26 10:30 .gitignore
drwxr-xr-x   8 user user  4096 Nov 26 10:28 \x1b[1;34m.git\x1b[0m
-rw-r--r--   1 user user  1842 Nov 26 09:15 package.json
-rw-r--r--   1 user user 45231 Nov 26 10:30 package-lock.json
drwxr-xr-x   3 user user  4096 Nov 25 16:40 \x1b[1;34mnode_modules\x1b[0m
drwxr-xr-x   2 user user  4096 Nov 26 10:15 \x1b[1;34msrc\x1b[0m
-rw-r--r--   1 user user   512 Nov 25 14:30 tsconfig.json
-rw-r--r--   1 user user  2048 Nov 26 08:45 README.md
-rwxr-xr-x   1 user user  8192 Nov 26 10:30 \x1b[1;32mbuild.sh\x1b[0m

\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ git status
On branch \x1b[1;36mmain\x1b[0m
Your branch is up to date with '\x1b[1;31morigin/main\x1b[0m'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	\x1b[32mmodified:   src/index.ts\x1b[0m
	\x1b[32mnew file:   src/utils.ts\x1b[0m

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
	\x1b[31mmodified:   package.json\x1b[0m

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	\x1b[35mtmp/\x1b[0m
	\x1b[35mdebug.log\x1b[0m

\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ npm run build

> my-app@1.0.0 build
> tsc && node dist/index.js

\x1b[1;33m[WARN]\x1b[0m Deprecation warning: 'fs.exists' is deprecated
\x1b[1;36m[INFO]\x1b[0m Compiling TypeScript files...
\x1b[1;36m[INFO]\x1b[0m Processing src/index.ts
\x1b[1;36m[INFO]\x1b[0m Processing src/utils.ts
\x1b[1;36m[INFO]\x1b[0m Processing src/types.ts
\x1b[1;32m[SUCCESS]\x1b[0m Build completed in 2.34s

\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ cat src/index.ts
\x1b[38;2;197;134;192mimport\x1b[0m { readFileSync } \x1b[38;2;197;134;192mfrom\x1b[0m \x1b[38;2;206;145;120m'fs'\x1b[0m;
\x1b[38;2;197;134;192mimport\x1b[0m { join } \x1b[38;2;197;134;192mfrom\x1b[0m \x1b[38;2;206;145;120m'path'\x1b[0m;
\x1b[38;2;197;134;192mimport\x1b[0m { parseConfig, validateInput } \x1b[38;2;197;134;192mfrom\x1b[0m \x1b[38;2;206;145;120m'./utils'\x1b[0m;

\x1b[38;2;106;153;85m// Main application entry point\x1b[0m
\x1b[38;2;197;134;192mconst\x1b[0m \x1b[38;2;156;220;254mconfig\x1b[0m = \x1b[38;2;220;220;170mparseConfig\x1b[0m(\x1b[38;2;206;145;120m'./config.json'\x1b[0m);

\x1b[38;2;197;134;192mfunction\x1b[0m \x1b[38;2;220;220;170mmain\x1b[0m(): \x1b[38;2;78;201;176mvoid\x1b[0m {
  \x1b[38;2;197;134;192mconst\x1b[0m \x1b[38;2;156;220;254mdata\x1b[0m = \x1b[38;2;220;220;170mreadFileSync\x1b[0m(\x1b[38;2;206;145;120m'input.txt'\x1b[0m, \x1b[38;2;206;145;120m'utf-8'\x1b[0m);

  \x1b[38;2;197;134;192mif\x1b[0m (!\x1b[38;2;220;220;170mvalidateInput\x1b[0m(\x1b[38;2;156;220;254mdata\x1b[0m)) {
    \x1b[38;2;156;220;254mconsole\x1b[0m.\x1b[38;2;220;220;170merror\x1b[0m(\x1b[38;2;206;145;120m'Invalid input data'\x1b[0m);
    \x1b[38;2;197;134;192mreturn\x1b[0m;
  }

  \x1b[38;2;156;220;254mconsole\x1b[0m.\x1b[38;2;220;220;170mlog\x1b[0m(\x1b[38;2;206;145;120m'Processing...'\x1b[0m);
  \x1b[38;2;106;153;85m// TODO: implement processing logic\x1b[0m
}

\x1b[38;2;220;220;170mmain\x1b[0m();

\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ tail -f /var/log/app.log
\x1b[2m2024-11-26 10:31:01\x1b[0m \x1b[1;36m[INFO]\x1b[0m  Server started on port 3000
\x1b[2m2024-11-26 10:31:02\x1b[0m \x1b[1;36m[INFO]\x1b[0m  Database connection established
\x1b[2m2024-11-26 10:31:05\x1b[0m \x1b[1;36m[INFO]\x1b[0m  GET /api/users - 200 OK (23ms)
\x1b[2m2024-11-26 10:31:08\x1b[0m \x1b[1;33m[WARN]\x1b[0m  Rate limit approaching for IP 192.168.1.100
\x1b[2m2024-11-26 10:31:10\x1b[0m \x1b[1;36m[INFO]\x1b[0m  POST /api/login - 200 OK (156ms)
\x1b[2m2024-11-26 10:31:12\x1b[0m \x1b[1;31m[ERROR]\x1b[0m Connection timeout for user_id=42
\x1b[2m2024-11-26 10:31:15\x1b[0m \x1b[1;36m[INFO]\x1b[0m  GET /api/products - 200 OK (45ms)
\x1b[2m2024-11-26 10:31:18\x1b[0m \x1b[1;36m[INFO]\x1b[0m  WebSocket connection from client_abc123
\x1b[2m2024-11-26 10:31:20\x1b[0m \x1b[1;33m[WARN]\x1b[0m  Deprecated API endpoint called: /v1/legacy
\x1b[2m2024-11-26 10:31:22\x1b[0m \x1b[1;31m[ERROR]\x1b[0m Failed to parse JSON: Unexpected token
\x1b[2m2024-11-26 10:31:25\x1b[0m \x1b[1;36m[INFO]\x1b[0m  Cache invalidated for key: user_sessions
\x1b[2m2024-11-26 10:31:28\x1b[0m \x1b[1;36m[INFO]\x1b[0m  Scheduled job 'cleanup' started
\x1b[2m2024-11-26 10:31:30\x1b[0m \x1b[1;32m[SUCCESS]\x1b[0m Job 'cleanup' completed, removed 1542 entries

\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ echo "Style showcase:"
Style showcase:

\x1b[1mBold text\x1b[0m
\x1b[2mFaint/dim text\x1b[0m
\x1b[3mItalic text\x1b[0m
\x1b[4mUnderlined text\x1b[0m
\x1b[7mInverse/reverse text\x1b[0m
\x1b[9mStrikethrough text\x1b[0m
\x1b[1;3;4mBold + Italic + Underline\x1b[0m

\x1b[30mBlack\x1b[0m \x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[33mYellow\x1b[0m \x1b[34mBlue\x1b[0m \x1b[35mMagenta\x1b[0m \x1b[36mCyan\x1b[0m \x1b[37mWhite\x1b[0m
\x1b[90mBright Black\x1b[0m \x1b[91mBright Red\x1b[0m \x1b[92mBright Green\x1b[0m \x1b[93mBright Yellow\x1b[0m
\x1b[94mBright Blue\x1b[0m \x1b[95mBright Magenta\x1b[0m \x1b[96mBright Cyan\x1b[0m \x1b[97mBright White\x1b[0m

\x1b[41m Red BG \x1b[0m \x1b[42m Green BG \x1b[0m \x1b[43m Yellow BG \x1b[0m \x1b[44m Blue BG \x1b[0m \x1b[45m Magenta BG \x1b[0m \x1b[46m Cyan BG \x1b[0m

\x1b[38;5;208mOrange (256 color)\x1b[0m
\x1b[38;5;129mPurple (256 color)\x1b[0m
\x1b[38;2;255;105;180mHot Pink (RGB)\x1b[0m
\x1b[38;2;0;255;127mSpring Green (RGB)\x1b[0m
\x1b[38;2;255;215;0mGold (RGB)\x1b[0m

\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ \x1b[5m_\x1b[0m
`

if (import.meta.main) {
  const inputFile = process.argv[2]
  let ansi: string | Buffer

  if (inputFile) {
    const fs = await import("fs")
    ansi = fs.readFileSync(inputFile)
  } else {
    ansi = SAMPLE_ANSI
  }

  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  createRoot(renderer).render(<App initialAnsi={ansi} />)
}
