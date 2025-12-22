#!/usr/bin/env node
/**
 * Test loading the native module with Node.js
 * This helps diagnose if issues are Bun-specific or native module issues
 */

const path = require("path")
const fs = require("fs")
const os = require("os")

const platform = os.platform()
const arch = os.arch()

console.log(`Platform: ${platform}-${arch}`)
console.log(`Node.js: ${process.version}`)

// Try development path first
let modulePath = path.join(__dirname, "..", "zig-out", "lib", "ghostty-opentui.node")

if (!fs.existsSync(modulePath)) {
  // Try dist path
  const distDir = `${platform === "win32" ? "win32" : platform}-${arch === "arm64" ? "arm64" : "x64"}`
  modulePath = path.join(__dirname, "..", "dist", distDir, "ghostty-opentui.node")
}

console.log(`Module path: ${modulePath}`)
console.log(`Exists: ${fs.existsSync(modulePath)}`)

if (!fs.existsSync(modulePath)) {
  console.error("Native module not found!")
  process.exit(1)
}

try {
  console.log("\nLoading native module...")
  const native = require(modulePath)
  console.log("Loaded successfully!")
  console.log("Exports:", Object.keys(native))

  // Test ptyToJson
  console.log("\nTesting ptyToJson...")
  const result = native.ptyToJson("Hello \x1b[31mRed\x1b[0m World", 80, 24, 0, 0)
  console.log("Result:", result.substring(0, 200) + "...")

  // Test ptyToText
  console.log("\nTesting ptyToText...")
  const text = native.ptyToText("Hello \x1b[31mRed\x1b[0m World", 80, 24)
  console.log("Result:", text)

  console.log("\n✓ All tests passed!")
} catch (err) {
  console.error("\n✗ Failed:", err.message)
  console.error(err.stack)
  process.exit(1)
}
