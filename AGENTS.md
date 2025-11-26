# pty-to-json Agent Guide

This repository uses Zig 0.15.2 and Ghostty's `ghostty-vt` library. 
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

before updating the changelog bump the package.json version field first. NEVER do major bumps. NEVER publish yourself

NEVER update existing changelog bullet points for previous version unless you added those bullet points yourself recently and the change is of the same version as it is now.


## zustand

- minimize number of props. do not use props if you can use zustand state instead. the app has global zustand state that lets you get a piece of state down from the component tree by using something like `useStore(x => x.something)` or `useLoaderData<typeof loader>()` or even useRouteLoaderData if you are deep in the react component tree

- do not consider local state truthful when interacting with server. when interacting with the server with rpc or api calls never use state from the render function as input for the api call. this state can easily become stale or not get updated in the closure context. instead prefer using zustand `useStore.getState().stateValue`. notice that useLoaderData or useParams should be fine in this case.

## changelog

when you make a change update or create the CHANGELOG.md file and bump the package.json version. on push ci will publish the package.
