import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard } from "@opentui/react"
import { ptyToJson, StyleFlags, type TerminalData, type TerminalSpan } from "./ffi"

const DEFAULT_FG = "#d4d4d4"
const DEFAULT_BG = "#1e1e1e"

function TerminalSpanView({ span }: { span: TerminalSpan }) {
  const { text, fg, bg, flags } = span

  let fgColor = fg || DEFAULT_FG
  let bgColor = bg || undefined

  if (flags & StyleFlags.INVERSE) {
    const temp = fgColor
    fgColor = bgColor || DEFAULT_BG
    bgColor = temp
  }

  const isBold = !!(flags & StyleFlags.BOLD)
  const isItalic = !!(flags & StyleFlags.ITALIC)
  const isUnderline = !!(flags & StyleFlags.UNDERLINE)
  const isFaint = !!(flags & StyleFlags.FAINT)

  let content: JSX.Element = <>{text}</>

  if (isBold) {
    content = <strong>{content}</strong>
  }
  if (isItalic) {
    content = <em>{content}</em>
  }
  if (isUnderline) {
    content = <u>{content}</u>
  }

  return (
    <span fg={fgColor} bg={bgColor} dim={isFaint}>
      {content}
    </span>
  )
}

function TerminalLineView({ spans }: { spans: TerminalSpan[] }) {
  if (spans.length === 0) {
    return <text> </text>
  }

  return (
    <text>
      {spans.map((span, i) => (
        <TerminalSpanView key={i} span={span} />
      ))}
    </text>
  )
}

export function TerminalView({ data }: { data: TerminalData }) {
  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <scrollbox
        focused
        style={{ flexGrow: 1 }}
        rootOptions={{ backgroundColor: DEFAULT_BG }}
        contentOptions={{ backgroundColor: DEFAULT_BG, padding: 4 }}
      >
        {data.lines.map((line, i) => (
          <TerminalLineView key={i} spans={line.spans} />
        ))}
      </scrollbox>
      <box style={{ height: 1, backgroundColor: "#21262d", paddingLeft: 1 }}>
        <text fg="#8b949e">
          {data.cols}x{data.rows} | Cursor: ({data.cursor[0]}, {data.cursor[1]}) | Lines: {data.totalLines}
        </text>
      </box>
    </box>
  )
}

function App({ data }: { data: TerminalData }) {
  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      process.exit(0)
    }
  })

  return <TerminalView data={data} />
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
  let input: string | Buffer

  if (inputFile) {
    const fs = await import("fs")
    input = fs.readFileSync(inputFile)
  } else {
    input = SAMPLE_ANSI
  }

  const data = ptyToJson(input, { cols: 120, rows: 40 })

  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  createRoot(renderer).render(<App data={data} />)
}
