#!/usr/bin/env bun
import { $ } from "bun"
import fs from "fs"
import path from "path"

const ROOT = path.resolve(import.meta.dir, "..")
const DIST = path.join(ROOT, "dist")
const ZIG_OUT = path.join(ROOT, "zig-out", "lib")

interface Target {
  name: string
  zigTarget: string | null // null means native
}

const TARGETS: Target[] = [
  { name: "linux-x64", zigTarget: "x86_64-linux-gnu" },
  { name: "linux-arm64", zigTarget: "aarch64-linux-gnu" },
  // musl targets disabled - ghostty's C++ deps (simdutf, highway) fail with PIC errors
  // { name: "linux-x64-musl", zigTarget: "x86_64-linux-musl" },
  // { name: "linux-arm64-musl", zigTarget: "aarch64-linux-musl" },
  { name: "darwin-x64", zigTarget: "x86_64-macos" },
  { name: "darwin-arm64", zigTarget: "aarch64-macos" },
  { name: "win32-x64", zigTarget: "x86_64-windows-gnu" },
]

async function build(target: Target): Promise<boolean> {
  const targetDir = path.join(DIST, target.name)
  const nodeFile = path.join(targetDir, "ghostty-opentui.node")

  console.log(`\n--- Building ${target.name} ---`)

  // Clean zig-out before each build to avoid stale artifacts
  fs.rmSync(path.join(ROOT, "zig-out"), { recursive: true, force: true })

  const args = ["-Doptimize=ReleaseFast"]
  if (target.zigTarget) {
    args.push(`-Dtarget=${target.zigTarget}`)
  }

  try {
    await $`zig build ${args}`.cwd(ROOT)

    // Find the output file (might have different extensions on Windows)
    let srcFile = path.join(ZIG_OUT, "ghostty-opentui.node")
    if (!fs.existsSync(srcFile)) {
      // Windows builds produce .dll
      srcFile = path.join(ZIG_OUT, "ghostty-opentui.dll")
    }
    if (!fs.existsSync(srcFile)) {
      // Also check for .so
      srcFile = path.join(ZIG_OUT, "libghostty-opentui.so")
    }

    if (!fs.existsSync(srcFile)) {
      console.error(`  ERROR: No output file found for ${target.name}`)
      console.error(`  Checked: ${ZIG_OUT}`)
      const files = fs.readdirSync(ZIG_OUT).join(", ")
      console.error(`  Available files: ${files}`)
      return false
    }

    // Copy to dist
    fs.mkdirSync(targetDir, { recursive: true })
    fs.copyFileSync(srcFile, nodeFile)

    const stats = fs.statSync(nodeFile)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
    console.log(`  OK: ${nodeFile} (${sizeMB} MB)`)
    return true
  } catch (error) {
    console.error(`  FAILED: ${target.name}`)
    console.error(error)
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)

  // Filter targets if specified
  let targets = TARGETS
  if (args.length > 0) {
    targets = TARGETS.filter((t) => args.includes(t.name))
    if (targets.length === 0) {
      console.error(`No matching targets. Available: ${TARGETS.map((t) => t.name).join(", ")}`)
      process.exit(1)
    }
  }

  console.log(`Building ${targets.length} target(s): ${targets.map((t) => t.name).join(", ")}`)

  // Clean dist folder for targets we're building
  for (const target of targets) {
    const targetDir = path.join(DIST, target.name)
    fs.rmSync(targetDir, { recursive: true, force: true })
  }

  const results: { target: string; success: boolean }[] = []

  for (const target of targets) {
    const success = await build(target)
    results.push({ target: target.name, success })
  }

  console.log("\n--- Summary ---")
  let failed = 0
  for (const r of results) {
    const status = r.success ? "OK" : "FAILED"
    console.log(`  ${r.target}: ${status}`)
    if (!r.success) failed++
  }

  if (failed > 0) {
    console.error(`\n${failed} target(s) failed`)
    process.exit(1)
  }

  console.log("\nAll targets built successfully!")
}

main()
