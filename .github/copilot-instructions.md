# MCP Bridge AI Coding Guide

## Project Overview
A **Dockerized MCP Bridge** written in Rust that acts as a transparent proxy between host MCP clients (Claude Desktop, etc.) and MCP servers running in isolated Docker containers. The bridge enables safe tool execution while maintaining seamless stdin/stdout communication for JSON-RPC.

## Architecture & Data Flow
```
Host MCP Client (Stdin) → Rust Bridge → Docker Attach (Stdin) → MCP Server Container
MCP Server (Stdout)     → Docker Attach (Stdout) → Rust Bridge → Host (Stdout)
Bridge Logs             → Host (Stderr)
```

**Core Components:**
1. **CLI Parser** (`src/main.rs`): Uses `clap` to handle `--image`, `--mount`, `--env` arguments
2. **Container Manager** (`src/container.rs`): Manages Docker lifecycle with `bollard`
3. **Path Resolver** (`src/paths.rs`): Converts relative → absolute paths for mounts
4. **Stream Piper**: Async bidirectional I/O between host and container using `tokio`

## Critical Implementation Rules

### 1. Zero Noise on Stdout (CRITICAL FOR MCP)
- **stdout = ONLY container output** (MCP JSON-RPC protocol requirement)
- ALL bridge logs/errors → `stderr` via `eprintln!()` macro
- Container config: `Tty: false` (prevents PTY control chars corrupting JSON)
- ✓ `eprintln!("[mcp-bridge] Starting...")` | ✗ `println!("Starting...")`

### 2. Docker Container Configuration
```rust
Config {
    tty: Some(false),              // CRITICAL: prevents JSON corruption
    open_stdin: Some(true),
    stdin_once: Some(true),
    attach_stdin: Some(true),
    attach_stdout: Some(true),
    attach_stderr: Some(true),
    // ...
}
```

### 3. Path Resolution Pattern
- All mount paths → absolute before Docker binding
- Implementation: `std::fs::canonicalize()` in `paths.rs`
- Example: `--mount ./data:/app` → `/home/user/project/data:/app`

### 4. Container Lifecycle
- UUID-based naming: `mcp-bridge-{uuid}` (enables parallel sessions)
- Guaranteed cleanup via `Drop` trait in `ContainerManager`
- Force removal on exit: `docker.remove_container(force: true)`

## Development Workflows

### Build & Test
```bash
cargo build --release           # Optimized binary
cargo test                      # Run unit tests
cargo run -- --image alpine -- sh -c "cat"  # Test I/O passthrough
```

### Docker Image Publishing
- **Workflow**: `.github/workflows/docker-publish.yml`
- **Registry**: `ghcr.io/fritzprix/mcp-agent:latest`
- **Trigger**: Push to `master` or version tags (`v*`)
- **Multi-arch**: Builds for `linux/amd64` and `linux/arm64`

### Default Image
- Production default: `ghcr.io/fritzprix/mcp-agent:latest`
- Override: `--image your-custom-image`
- Agent source: `agent/` directory (TypeScript MCP server)

## Agent Container (`agent/`)
- **Base**: `node:20-alpine` (optimized for size)
- **Tools**: ripgrep, git, tree, curl, jq (minimal essential set)
- **Capabilities**: Shell execution, filesystem ops, process management
- **Build**: Multi-stage (builder + runtime) for ~100MB final image

## Error Handling Pattern
```rust
// Never panic on runtime errors
Docker::connect().context("Failed to connect to Docker daemon")?;

// User-friendly errors to stderr
eprintln!("[mcp-bridge] Error: {}", e);
std::process::exit(1);
```

## Testing Strategy
1. **Passthrough Test**: Echo data through container unchanged
2. **Multi-mount**: Verify multiple `--mount` flags work
3. **Parallel Sessions**: Confirm UUID prevents naming conflicts
4. **MCP Protocol**: JSON-RPC passes through without corruption

## Key Files
- `src/main.rs`: CLI entry, signal handling, orchestration
- `src/container.rs`: Docker operations, I/O streaming
- `src/paths.rs`: Mount path resolution
- `agent/Dockerfile`: Reference MCP server image
- `SPEC.md`: Complete requirements specification
