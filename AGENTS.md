# pty-to-json Agent Guide

This repository uses Zig 0.15.2 and Ghostty's `ghostty-vt` library. Follow these conventions when modifying code or adding tests.

## Build & Run

- Prefer the pinned Zig toolchain from the parent directory:
  - `../zig-x86_64-linux-0.15.2/zig build`
  - `../zig-x86_64-linux-0.15.2/zig build -Doptimize=ReleaseFast`
- The main binary is built to `zig-out/bin/pty-to-json`.
- To use the automated setup script, run `./setup.sh` from the repo root. It will:
  - Install Zig 0.15.2 (by default to `/opt/zig` and `/usr/local/bin/zig`) if `zig` is missing or not the required version.
  - Clone and patch Ghostty, then invoke `zig build` (which by default targets `zig-out/bin/pty-to-json`).
- In environments that already provide Zig 0.15.2 (for example via a prebuilt toolchain under `/build/zig` or the unpacked `../zig-x86_64-linux-0.15.2/zig`), you can:
  - Put that Zig binary on `PATH` and run `zig build` / `zig build test` directly, or
  - Skip the installation part of `./setup.sh` entirely and just use the existing toolchain.

## Testing

- Use Zig's built-in test framework only:
  - Write `test` blocks in Zig files and use `std.testing` assertions.
  - Small/unit tests (e.g., helpers like `parseColor`) should live next to the code they exercise (in the same file).
  - Integration or higher-level tests may also live in `src/main.zig` or other modules reachable from the root module.
- Test data files should live under `testdata/` (already used for `testdata/session.log`).
- Run the full test suite with:
  - `../zig-x86_64-linux-0.15.2/zig build test`
- Do not introduce additional testing frameworks or external dependencies.

## CLI & Documentation

- Keep the CLI usage text in `src/main.zig` and the Usage section in `README.md` in sync.
- When adding new flags or behavior, prefer unit tests for any non-trivial parsing or formatting logic.

## General Style

- Follow existing naming and error-handling patterns in `src/main.zig`.
- Avoid adding comments unless explicitly requested.
- Keep changes minimal and focused on the relevant issue.
