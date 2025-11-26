#!/bin/bash
#
# pty-to-json setup script
# Installs Zig 0.15.2, clones Ghostty, applies patches, and builds the project
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIG_VERSION="0.15.2"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS and architecture
detect_platform() {
    local os arch

    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="macos" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *)
            log_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64) arch="x86_64" ;;
        aarch64|arm64) arch="aarch64" ;;
        *)
            log_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac

    echo "${arch}-${os}"
}

# Check if Zig is installed and has correct version
check_zig() {
    if command -v zig &> /dev/null; then
        local installed_version
        installed_version=$(zig version 2>/dev/null || echo "unknown")
        if [ "$installed_version" = "$ZIG_VERSION" ]; then
            log_info "Zig $ZIG_VERSION is already installed"
            return 0
        else
            log_warn "Zig $installed_version is installed, but $ZIG_VERSION is required"
            return 1
        fi
    else
        log_info "Zig is not installed"
        return 1
    fi
}

# Install Zig
install_zig() {
    local platform
    platform=$(detect_platform)

    log_info "Installing Zig $ZIG_VERSION for $platform..."

    local ext="tar.xz"
    local zig_dir="zig-${platform}-${ZIG_VERSION}"
    local zig_url="https://ziglang.org/download/${ZIG_VERSION}/zig-${platform}-${ZIG_VERSION}.${ext}"

    # Create temp directory
    local tmp_dir
    tmp_dir=$(mktemp -d)
    cd "$tmp_dir"

    log_info "Downloading from $zig_url..."
    curl -LO "$zig_url"

    log_info "Extracting..."
    tar xf "zig-${platform}-${ZIG_VERSION}.${ext}"

    # Install to /opt/zig (requires sudo)
    if [ -d "/opt/zig" ]; then
        log_warn "Removing existing /opt/zig..."
        sudo rm -rf /opt/zig
    fi

    log_info "Installing to /opt/zig..."
    sudo mv "$zig_dir" /opt/zig

    # Create symlink
    log_info "Creating symlink at /usr/local/bin/zig..."
    sudo ln -sf /opt/zig/zig /usr/local/bin/zig

    # Cleanup
    cd "$SCRIPT_DIR"
    rm -rf "$tmp_dir"

    # Verify installation
    local installed_version
    installed_version=$(zig version)
    if [ "$installed_version" = "$ZIG_VERSION" ]; then
        log_info "Zig $ZIG_VERSION installed successfully"
    else
        log_error "Zig installation failed. Got version: $installed_version"
        exit 1
    fi
}

# Clone Ghostty repository
clone_ghostty() {
    local ghostty_dir="$SCRIPT_DIR/../ghostty"

    if [ -d "$ghostty_dir" ]; then
        log_info "Ghostty directory already exists at $ghostty_dir"
        return 0
    fi

    log_info "Cloning Ghostty repository..."
    cd "$SCRIPT_DIR/.."
    git clone https://github.com/ghostty-org/ghostty.git
    cd "$SCRIPT_DIR"
}

# Build pty-to-json
build_project() {
    log_info "Building pty-to-json in release mode..."
    cd "$SCRIPT_DIR"
    zig build -Doptimize=ReleaseFast

    if [ -f "zig-out/bin/pty-to-json" ]; then
        log_info "Build successful!"
        log_info "Binary available at: $SCRIPT_DIR/zig-out/bin/pty-to-json"
    else
        log_error "Build failed - binary not found"
        exit 1
    fi
}

# Main
main() {
    echo "=========================================="
    echo "  pty-to-json Setup Script"
    echo "=========================================="
    echo

    # Step 1: Check/Install Zig
    # if ! check_zig; then
    #     install_zig
    # fi

    # Step 2: Clone Ghostty
    clone_ghostty

    # Step 3: Build project
    build_project

    echo
    echo "=========================================="
    echo "  Setup Complete!"
    echo "=========================================="
    echo
    echo "Usage:"
    echo "  ./zig-out/bin/pty-to-json [OPTIONS] [FILE]"
    echo
    echo "Example:"
    echo "  ./zig-out/bin/pty-to-json -o output.json session.log"
    echo
}

main "$@"
