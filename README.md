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

### Download Binary
Download the latest release for your platform from the [Releases](https://github.com/yourusername/mcp-bridge/releases) page.

### Build from Source
Ensure you have [Rust](https://rustup.rs/) and [Docker](https://docs.docker.com/get-docker/) installed.

```bash
git clone https://github.com/yourusername/mcp-bridge.git
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

*   `--image <IMAGE>`: Docker image to use (default: `mcp-server:latest`).
*   `-v, --mount <SRC:DST>`: Mount a host directory to a container path. Can be used multiple times. Relative host paths are automatically resolved to absolute paths.
*   `-e, --env <KEY=VALUE>`: Set environment variables. Can be used multiple times.
*   `[COMMAND]...`: The command to run inside the container (e.g., `node build/index.js`, `python server.py`).

### Examples

#### Basic Usage
Run an MCP server from `alpine` image:
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
mcp-bridge --image my-mcp-server \
  --env API_KEY=secret123 \
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

## 📄 License
MIT
