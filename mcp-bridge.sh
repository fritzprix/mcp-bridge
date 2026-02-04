#!/usr/bin/env bash

# MCP Bridge Wrapper Script
# Provides convenient shortcuts and preset configurations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY="${MCP_BRIDGE_BIN:-mcp-bridge}"

# Check if binary exists
if ! command -v "$BINARY" &> /dev/null; then
    echo "Error: mcp-bridge not found in PATH"
    echo "Please install it first using: curl -fsSL https://raw.githubusercontent.com/fritzprix/mcp-bridge/master/install.sh | bash"
    exit 1
fi

# Default configuration
DEFAULT_IMAGE="ghcr.io/fritzprix/mcp-agent:latest"
WORKSPACE_MOUNT="$(pwd):/workspace"

# Parse command
case "${1:-run}" in
    run)
        # Run with default agent image and current directory mounted
        shift
        exec "$BINARY" \
            --image "$DEFAULT_IMAGE" \
            --mount "$WORKSPACE_MOUNT" \
            "$@"
        ;;
    
    shell)
        # Open an interactive shell in the container
        shift
        exec "$BINARY" \
            --image "${1:-$DEFAULT_IMAGE}" \
            --mount "$WORKSPACE_MOUNT" \
            -- sh
        ;;
    
    custom)
        # Run with custom image
        shift
        local image="$1"
        shift
        exec "$BINARY" \
            --image "$image" \
            --mount "$WORKSPACE_MOUNT" \
            "$@"
        ;;
    
    help|--help|-h)
        cat << 'EOF'
MCP Bridge Wrapper

Usage: mcp-bridge.sh [COMMAND] [OPTIONS]

Commands:
    run [CMD...]        Run MCP agent with current directory mounted (default)
    shell [IMAGE]       Open interactive shell in container
    custom IMAGE [CMD]  Run custom image with current directory mounted
    help                Show this help message

Examples:
    # Run default agent
    mcp-bridge.sh run

    # Open shell in default agent
    mcp-bridge.sh shell

    # Open shell in custom image
    mcp-bridge.sh shell alpine

    # Run custom image with command
    mcp-bridge.sh custom node:20-alpine -- node server.js

Environment Variables:
    MCP_BRIDGE_BIN      Path to mcp-bridge binary (default: mcp-bridge in PATH)

For more information, see: https://github.com/fritzprix/mcp-bridge
EOF
        ;;
    
    *)
        # Pass everything to mcp-bridge
        exec "$BINARY" "$@"
        ;;
esac
