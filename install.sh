#!/usr/bin/env bash

set -e

# MCP Bridge Installation Script
# Downloads and installs the latest mcp-bridge binary from GitHub releases

REPO="fritzprix/mcp-bridge"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="mcp-bridge"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Detect OS and architecture
detect_platform() {
    local os arch

    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *)          error "Unsupported OS: $(uname -s)" ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)   arch="x86_64" ;;
        aarch64|arm64)  arch="aarch64" ;;
        *)              error "Unsupported architecture: $(uname -m)" ;;
    esac

    if [ "$os" = "windows" ]; then
        echo "${BINARY_NAME}-${arch}-pc-windows-msvc.exe"
    elif [ "$os" = "darwin" ]; then
        echo "${BINARY_NAME}-${arch}-apple-darwin"
    else
        echo "${BINARY_NAME}-${arch}-unknown-linux-gnu"
    fi
}

# Get the latest release URL
get_latest_release() {
    local api_url="https://api.github.com/repos/${REPO}/releases/latest"
    local asset_name="$1"
    
    info "Fetching latest release information..."
    
    local download_url=$(curl -s "$api_url" \
        | grep "browser_download_url.*${asset_name}" \
        | cut -d '"' -f 4)
    
    if [ -z "$download_url" ]; then
        error "Could not find release asset: ${asset_name}"
    fi
    
    echo "$download_url"
}

# Download and install binary
install_binary() {
    local asset_name="$1"
    local download_url
    
    download_url=$(get_latest_release "$asset_name")
    
    info "Downloading from: $download_url"
    
    # Create install directory if it doesn't exist
    mkdir -p "$INSTALL_DIR"
    
    # Download to temporary file
    local tmp_file=$(mktemp)
    if ! curl -L -o "$tmp_file" "$download_url"; then
        rm -f "$tmp_file"
        error "Failed to download binary"
    fi
    
    # Move to install directory and make executable
    local target_path="$INSTALL_DIR/$BINARY_NAME"
    mv "$tmp_file" "$target_path"
    chmod +x "$target_path"
    
    info "Installed to: $target_path"
}

# Check if directory is in PATH
check_path() {
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        warn "$INSTALL_DIR is not in your PATH"
        echo ""
        echo "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
        echo "    export PATH=\"\$PATH:$INSTALL_DIR\""
        echo ""
    fi
}

# Verify Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first: https://docs.docker.com/get-docker/"
    fi
    
    if ! docker ps &> /dev/null; then
        error "Docker daemon is not running or you don't have permission to access it"
    fi
}

# Main installation flow
main() {
    info "Installing mcp-bridge..."
    
    # Check prerequisites
    check_docker
    
    # Detect platform and get appropriate binary name
    local asset_name
    asset_name=$(detect_platform)
    info "Detected platform: $asset_name"
    
    # Download and install
    install_binary "$asset_name"
    
    # Verify installation
    if [ -x "$INSTALL_DIR/$BINARY_NAME" ]; then
        info "Installation successful! 🎉"
        echo ""
        "$INSTALL_DIR/$BINARY_NAME" --version 2>/dev/null || echo "Version: latest"
        echo ""
        
        # Check PATH
        check_path
        
        echo "Quick start:"
        echo "    $BINARY_NAME --mount \$(pwd):/workspace"
        echo ""
        echo "For more information, visit: https://github.com/$REPO"
    else
        error "Installation verification failed"
    fi
}

main "$@"
