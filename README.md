# Dockerized MCP Bridge

A robust **Model Context Protocol (MCP) Bridge** written in Rust. This CLI tool acts as a transparent proxy, enabling local MCP clients (like Claude Desktop or Libr Agent) to securely communicate with MCP servers running inside isolated Docker containers.

## 🚀 Features

*   **Isolation**: All MCP servers run inside ephemeral Docker containers, protecting your host system.
*   **Transparency**: Seamlessly pipes Standard I/O (Stdin/Stdout) so the host client is unaware of the Docker layer.
*   **Concurrency**: Uses UUID-based container naming to support multiple parallel sessions without conflicts.
*   **Auto-Cleanup**: Guarantees container removal on exit, even if the process is interrupted (Ctrl+C).
*   **Easy Mounting**: Automatic absolute path resolution for volume mounts.
*   **Cross-Platform**: Binaries available for Linux, macOS, and Windows.

## 📦 Installation

### Quick Install (Recommended)
One-line installation script that downloads the latest release for your platform:

```bash
curl -fsSL https://raw.githubusercontent.com/fritzprix/mcp-bridge/master/install.sh | bash
```

This will:
- Auto-detect your OS and architecture (Linux/macOS/Windows, x86_64/aarch64)
- Download the latest binary from GitHub releases
- Install to `~/.local/bin` (customizable with `INSTALL_DIR`)
- Verify Docker availability

### Manual Download
Download the latest release for your platform from the [Releases](https://github.com/fritzprix/mcp-bridge/releases) page:
- Linux: `mcp-bridge-x86_64-unknown-linux-gnu`
- macOS (Intel): `mcp-bridge-x86_64-apple-darwin`
- macOS (Apple Silicon): `mcp-bridge-aarch64-apple-darwin`
- Windows: `mcp-bridge-x86_64-pc-windows-msvc.exe`

### Build from Source
Ensure you have [Rust](https://rustup.rs/) and [Docker](https://docs.docker.com/get-docker/) installed.

```bash
git clone https://github.com/fritzprix/mcp-bridge.git
cd mcp-bridge
cargo build --release
# Binary will be at ./target/release/mcp-bridge
```

## 🛠 Usage

The `mcp-bridge` CLI wraps your Docker command arguments to streamline execution.

```bash
mcp-bridge [OPTIONS] [COMMAND]...
```

### Options

*   `--image <IMAGE>`: Docker image to use (default: `ghcr.io/fritzprix/mcp-agent:latest`).
*   `-v, --mount <SRC:DST>`: Mount a host directory to a container path. Can be used multiple times. Relative host paths are automatically resolved to absolute paths.
*   `-e, --env <KEY=VALUE>`: Set environment variables. Can be used multiple times.
*   `[COMMAND]...`: The command to run inside the container (e.g., `node build/index.js`, `python server.py`).

### Convenience Wrapper (Optional)
For simplified usage, you can use the provided wrapper script:

```bash
# Download the wrapper
curl -fsSL https://raw.githubusercontent.com/fritzprix/mcp-bridge/master/mcp-bridge.sh -o mcp-bridge.sh
chmod +x mcp-bridge.sh

# Run with defaults (mounts current directory)
./mcp-bridge.sh run

# Open interactive shell
./mcp-bridge.sh shell

# Use custom image
./mcp-bridge.sh custom alpine -- sh -c "echo hello"
```

### Examples

#### Quick Start (Using Pre-built Image)
```bash
# Mount current directory and run the agent
mcp-bridge --mount $(pwd):/workspace
```

#### Basic Usage with Custom Image
Run an MCP server from any Docker image:
```bash
mcp-bridge --image alpine -- sh -c "echo 'Starting MCP Server...'"
```

#### Mounting Directories
Mount the current directory (`.`) to `/app` in the container:
```bash
mcp-bridge --image my-mcp-server \
  --mount .:/app \
  -- node /app/index.js
```

#### Injecting Environment Variables
Pass API keys or config:
```bash
mcp-bridge --env API_KEY=secret123 \
  --env DEBUG=true \
  -- python main.py
```

## 🏗 Architecture

1.  **CLI Entry**: Parses arguments, resolves relative paths for mounts, and generates a unique Session ID (UUID).
2.  **Container Creation**: Spawns a Docker container (`mcp-bridge-{uuid}`) with `Tty: false` to ensure clean JSON-RPC communication.
3.  **I/O Piping**: Asynchronously pipes Host Stdin → Container Stdin and Container Stdout → Host Stdout using `tokio`.
4.  **Log Separation**: All bridge logs (connection status, errors) are sent to **Stderr** so they don't corrupt the MCP protocol on Stdout.
5.  **Cleanup**: A custom `Drop` implementation ensures `docker rm -f` is called when the bridge process terminates.

## 🧪 Development

### Running Tests
```bash
cargo test
```

### Local Verification
```bash
# Verify clean exit behavior
cargo run -- --image alpine -- sh -c "echo clean_exit"
```

## 🤖 Mcp Agent

The project includes a reference MCP Agent implementation in the `agent/` directory, designed to run within the Docker environment managed by the bridge.

### Features
- **Shell Capability**: Execute commands, manage background processes.
- **Filesystem Capability**: optimized `search_files` (ripgrep), `directory_tree` (tree), and standard file operations.
- **Resources**: Observe running processes via `internal://processes/list`.

### Usage

**Quick Start (Pre-built Image):**
```bash
# Use the pre-built image from GitHub Container Registry
mcp-bridge --mount $(pwd):/workspace
```

**Or build locally:**
```bash
cd agent
npm install
npm run build
docker build -t mcp-agent .
# Run with local image
mcp-bridge --image mcp-agent --mount $(pwd):/workspace
```


## � Client Configuration

To use this with [Claude Desktop](https://modelcontextprotocol.io/quickstart#install-claude-for-desktop) or other MCP clients, add the following to your config file (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "docker-agent": {
      "command": "/path/to/mcp-bridge",
      "args": [
        "--mount", "/absolute/path/to/your/project:/workspace"
      ]
    }
  }
}
```

> **Note**: Replace `/path/to/mcp-bridge` with the absolute path to your compiled binary and `/absolute/path/to/your/project` with the directory you want the agent to access. The default image (`ghcr.io/fritzprix/mcp-agent:latest`) will be pulled automatically.
