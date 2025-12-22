const { platform, arch } = require("os")

function loadNativeModule() {
  // Try development path first
  try {
    return require("../zig-out/lib/ghostty-opentui.node")
  } catch {}

  // Load platform-specific dist path (hardcoded for static analysis)
  const p = platform()
  const a = arch()

  if (p === "darwin" && a === "arm64") {
    return require("../dist/darwin-arm64/ghostty-opentui.node")
  }
  if (p === "darwin" && a === "x64") {
    return require("../dist/darwin-x64/ghostty-opentui.node")
  }
  if (p === "linux" && a === "arm64") {
    return require("../dist/linux-arm64/ghostty-opentui.node")
  }
  if (p === "linux" && a === "x64") {
    return require("../dist/linux-x64/ghostty-opentui.node")
  }

  // Windows - not supported (Zig build issues), use strip-ansi fallback
  if (p === "win32") {
    return null
  }

  throw new Error(`Unsupported platform: ${p}-${a}`)
}

const native = loadNativeModule()

module.exports = { native }
