# ghostty-opentui Agent Guide

This repository uses Zig 0.15.2 and Ghostty's `ghostty-vt` library.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TypeScript (tui/ffi.ts)                                                │
│  - Loads .node file via require()                                       │
│  - Calls native functions: ptyToJson, ptyToText, ptyToHtml              │
│  - Converts JSON output to typed TerminalData                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  N-API Bridge (napigen)                                                 │
│  - Converts JS strings to Zig slices                                    │
│  - Converts Zig return values to JS                                     │
│  - Handles errors as JS exceptions                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Zig Library (src/lib.zig)                                              │
│  - Creates Ghostty Terminal instance                                    │
│  - Feeds ANSI input through VT stream                                   │
│  - Extracts styled spans from terminal buffer                           │
│  - Outputs JSON with colors, styles, cursor position                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Ghostty VT Emulator (deps/ghostty)                                     │
│  - Full terminal emulation (not just ANSI parsing)                      │
│  - Handles cursor movement, scrolling, line wrapping                    │
│  - Maintains screen buffer with cells, styles, colors                   │
│  - Supports 16/256/RGB colors, bold, italic, underline, etc.            │
└─────────────────────────────────────────────────────────────────────────┘
```

## napigen

[napigen](https://github.com/cztomsik/napigen) is used to create N-API bindings for the Zig code. This allows the Zig library to be loaded as a native Node.js addon (.node file).

### How it works

1. **Define functions in Zig** - Regular Zig functions that accept/return supported types
2. **Register with napigen** - Use `comptime { napigen.defineModule(initModule); }`
3. **Export functions** - In `initModule`, use `js.createFunction()` and `js.setNamedProperty()`
4. **Build outputs .node file** - `zig build` produces `ghostty-opentui.node`
5. **Load in JS** - Use `require()` to load and call functions directly

### Supported types

- Primitives: `i32`, `u32`, `bool`, etc. (maps to JS numbers/booleans)
- Strings: `[]const u8` (maps to JS strings)
- Return strings by allocating and returning `[]const u8`

### Example

```zig
// src/lib.zig
const napigen = @import("napigen");

fn add(a: i32, b: i32) i32 {
    return a + b;
}

fn greet(name: []const u8) ![]const u8 {
    // Return allocated string (caller must handle memory)
    return std.fmt.allocPrint(allocator, "Hello, {s}!", .{name});
}

comptime {
    napigen.defineModule(initModule);
}

fn initModule(js: *napigen.JsContext, exports: napigen.napi_value) !napigen.napi_value {
    try js.setNamedProperty(exports, "add", try js.createFunction(add));
    try js.setNamedProperty(exports, "greet", try js.createFunction(greet));
    return exports;
}
```

```typescript
// Usage in TypeScript (Bun)
// IMPORTANT: Do NOT use createRequire - it breaks bun compile
// Bun provides global require() in ESM modules
const native = require("./zig-out/lib/ghostty-opentui.node")

native.add(1, 2)        // => 3
native.greet("World")   // => "Hello, World!"
```

### Testing with napigen

napigen requires N-API symbols that only exist when loaded as a Node addon. For Zig tests, we conditionally exclude napigen:

```zig
const builtin = @import("builtin");
const napigen = if (builtin.is_test) undefined else @import("napigen");

// Only define module when not testing
comptime {
    if (!builtin.is_test) {
        napigen.defineModule(initModule);
    }
}
```

The `build.zig` creates a separate test module without napigen imports.

## Ghostty VT vs node-pty

These are **different things** that complement each other:

| node-pty | Ghostty VT Emulator |
|----------|---------------------|
| Spawns processes (bash, etc.) | Parses ANSI escape sequences |
| Creates pseudo-terminal (PTY) | Maintains screen buffer |
| Raw bytes in/out | Tracks cursor, colors, styles |
| No parsing or rendering | Handles scrolling, wrapping |

For interactive terminals, you'd use both:
- node-pty spawns the shell and gives raw output
- Ghostty VT parses that output into renderable state

Currently this library is **read-only** - it parses ANSI but doesn't maintain persistent state between calls. For interactive use, we'd need to add persistent terminal instances (see README for future plans).

## Build & Run

to build zig run zig build

for typechecking the ts use bun tsc

## Testing

use zig tests inside lib.zig for tests of zig code

For typescript testing use bun test. inline snapshots are preferred

## CLI & Documentation

- Keep the CLI usage text in `src/main.zig` and the Usage section in `README.md` in sync.
- When adding new flags or behavior, prefer unit tests for any non-trivial parsing or formatting logic.



## opentui

opentui is the framework used to render the tui, using react.

IMPORTANT! before starting every task ALWAYS read opentui docs with `curl -s https://raw.githubusercontent.com/sst/opentui/refs/heads/main/packages/react/README.md`

ALWAYS!

## bun

NEVER run bun run index.tsx. You cannot directly run the tui app. it will hang. instead ask me to do so.

NEVER use require. just import at the top of the file with esm

use bun add to install packages instead of npm

use bun install to install dependencies

use bun test to run the tui tests

## React

NEVER pass function or callbacks as dependencies of useEffect, this will very easily cause infinite loops if you forget to use useCallback

NEVER use useCallback. it is useless if we never pass functions in useEffect dependencies

Try to never use useEffect if possible. usually you can move logic directly in event handlers instead

## Rules

- if you need Node.js apis import the namespace and not the named exports: `import fs from 'fs'` and not `import { writeFileSync } from 'fs'`
- DO NOT use as any. instead try to understand how to fix the types in other ways
- to implement compound components like `List.Item` first define the type of List, using a interface, then use : to implement it and add compound components later using . and omitting the props types given they are already typed by the interface, here is an example
- DO NOT use console.log. only use logger.log instead
- <input> uses onInput not onChange. it is passed a simple string value and not an event object
- to render examples components use renderWithProviders not render
- ALWAYS bind all class methods to `this` in the constructor. This ensures methods work correctly when called in any context (callbacks, event handlers, etc). Example:

  ```typescript
  constructor(options: Options) {
    // Initialize properties
    this.prop = options.prop

    // Bind all methods to this instance
    this.method1 = this.method1.bind(this)
    this.method2 = this.method2.bind(this)
    this.privateMethod = this.privateMethod.bind(this)
  }
  ```

## reading github repositories

you can use gitchamber.com to read repo files. run `curl https://gitchamber.com` to see how the API works. always use curl to fetch the responses of gitchamber.com

for example when working with the vercel ai sdk, you can fetch the latest docs using:

https://gitchamber.com/repos/repos/vercel/ai/main/files

use gitchamber to read the .md files using curl

## researching opentui patterns

you can read more examples of opentui react code using gitchamber by listing and reading files from the correct endpoint: https://gitchamber.com/repos/sst/opentui/main/files?glob=packages/react/examples/**

## changelog

after any meaningful change update CHANGELOG.md with the version number and the list of changes made. in concise bullet points

in bullet points use nested list and specify for which command exactly are the changes. or group them to make it clear what they cover.

before updating the changelog bump the package.json version field first. NEVER do major bumps

NEVER update existing changelog bullet points for previous version unless you added those bullet points yourself recently and the change is of the same version as it is now.


## zustand

- minimize number of props. do not use props if you can use zustand state instead. the app has global zustand state that lets you get a piece of state down from the component tree by using something like `useStore(x => x.something)` or `useLoaderData<typeof loader>()` or even useRouteLoaderData if you are deep in the react component tree

- do not consider local state truthful when interacting with server. when interacting with the server with rpc or api calls never use state from the render function as input for the api call. this state can easily become stale or not get updated in the closure context. instead prefer using zustand `useStore.getState().stateValue`. notice that useLoaderData or useParams should be fine in this case.

## Publishing

NEVER run `npm publish` locally. CI handles publishing automatically on push to main. Local publishing causes issues because:
- The `dist/` folder may have outdated or missing binaries for other platforms
- CI builds fresh binaries for all platforms (darwin-arm64, darwin-x64, linux-arm64, linux-x64)
- Publishing locally with stale binaries breaks the package for users

When you make a change:
1. Bump the package.json version
2. Update CHANGELOG.md
3. Commit and push to main
4. CI will build and publish automatically
