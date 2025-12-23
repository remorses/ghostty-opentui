import { createCliRenderer, type ScrollBoxRenderable } from "@opentui/core"
import { createRoot, useKeyboard, extend } from "@opentui/react"
import { useState, useRef } from "react"
import { StatelessTerminalRenderable } from "../src/terminal-buffer"

extend({ "stateless-terminal": StatelessTerminalRenderable })

export function TerminalView({ ansi }: { ansi: string | Buffer }) {
  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <scrollbox focused padding={3} style={{ flexGrow: 1 }}>
        <stateless-terminal ansi={ansi} cols={120} rows={120} />
      </scrollbox>
    </box>
  )
}

function App({ initialAnsi }: { initialAnsi: string | Buffer }) {
  const [ansi, setAnsi] = useState(initialAnsi)
  const [count, setCount] = useState(0)
  const scrollBoxRef = useRef<ScrollBoxRenderable>(null)
  const terminalRef = useRef<StatelessTerminalRenderable>(null)

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
      scrollBoxRef.current?.scrollTo(0)
    }
    if (key.name === "b") {
      if (scrollBoxRef.current && terminalRef.current) {
        const lastLine = terminalRef.current.lineCount - 1
        const scrollPos = terminalRef.current.getScrollPositionForLine(lastLine)
        scrollBoxRef.current.scrollTo(scrollPos)
      }
    }
    if (key.name === "1" || key.name === "2" || key.name === "3") {
      if (scrollBoxRef.current && terminalRef.current) {
        const lineMap: Record<string, number> = { "1": 10, "2": 50, "3": 100 }
        const scrollPos = terminalRef.current.getScrollPositionForLine(lineMap[key.name])
        scrollBoxRef.current.scrollTo(scrollPos)
      }
    }
  })

  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <box style={{ height: 2, paddingLeft: 1, marginBottom: 1, flexDirection: "column" }}>
        <text fg="#8b949e">Press 'p' to add prefix | 't' top | 'b' bottom | '1' line 10 | '2' line 50 | '3' line 100</text>
        <text fg="#8b949e">Press 'q' to quit | Prefix count: {count} | Lines: {terminalRef.current?.lineCount ?? 0}</text>
      </box>
      <scrollbox ref={scrollBoxRef} focused padding={3} style={{ flexGrow: 1 }}>
        <stateless-terminal ref={terminalRef} ansi={ansi} cols={120} rows={120} />
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

\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ git status
On branch \x1b[1;36mmain\x1b[0m
Changes to be committed:
	\x1b[32mmodified:   src/index.ts\x1b[0m
	\x1b[32mnew file:   src/utils.ts\x1b[0m

Changes not staged for commit:
	\x1b[31mmodified:   package.json\x1b[0m

\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ npm run build
\x1b[1;33m[WARN]\x1b[0m Deprecation warning: 'fs.exists' is deprecated
\x1b[1;36m[INFO]\x1b[0m Compiling TypeScript files...
\x1b[1;32m[SUCCESS]\x1b[0m Build completed in 2.34s

\x1b[1;32muser@hostname\x1b[0m:\x1b[1;34m~/projects/my-app\x1b[0m$ echo "Style showcase:"
Style showcase:

\x1b[1mBold text\x1b[0m
\x1b[2mFaint/dim text\x1b[0m
\x1b[3mItalic text\x1b[0m
\x1b[4mUnderlined text\x1b[0m
\x1b[7mInverse/reverse text\x1b[0m
\x1b[9mStrikethrough text\x1b[0m

\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[33mYellow\x1b[0m \x1b[34mBlue\x1b[0m \x1b[35mMagenta\x1b[0m \x1b[36mCyan\x1b[0m
\x1b[38;5;208mOrange (256 color)\x1b[0m
\x1b[38;2;255;105;180mHot Pink (RGB)\x1b[0m
`

if (require.main === module) {
  ;(async () => {
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
  })()
}
