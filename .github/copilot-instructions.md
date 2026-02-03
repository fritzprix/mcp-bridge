# MCP Bridge AI Coding Guide

## Project Overview
This is a **Dockerized MCP Bridge** written in Rust that acts as a transparent proxy between host processes (Claude Desktop, Libr Agent) and MCP servers running in isolated Docker containers. The bridge enables safe tool execution by routing all operations through Docker while maintaining seamless stdin/stdout communication.

## Architecture & Data Flow
```
Host Process (Stdin) → Rust Bridge → Docker Attach (Stdin) → MCP Server
MCP Server (Stdout) → Docker Attach (Stdout) → Rust Bridge → Host Process (Stdout)
Rust Bridge (Logs) → Host Process (Stderr)
```

**Core Components:**
1. **CLI Parser** (`clap`): Handles `--image`, `--mount`, `--env`, `--workdir` arguments
2. **Container Lifecycle Manager** (`bollard`): Creates, starts, and terminates Docker containers
3. **Stream Piper** (`tokio`): Bidirectional async I/O between host and container
4. **Signal Handler**: Ensures container cleanup on SIGINT/SIGTERM

## Critical Implementation Constraints

### Zero Noise on Stdout (MOST IMPORTANT)
- **stdout MUST contain ONLY container output** - the MCP protocol depends on this
- ALL logs, errors, debug info, startup/shutdown messages → `stderr`
- Container config: `Tty: false` (prevents JSON corruption)
- Example violation: `eprintln!("Starting container...")` ✓ | `println!("Starting...")` ✗

### Docker Configuration Requirements
```rust
// Container must be configured with:
Tty: false              // Critical: prevents data pollution
OpenStdin: true
StdinOnce: true
AttachStdin: true
AttachStdout: true
AttachStderr: true
```

### Path Handling
- Convert all user-provided relative paths (e.g., `.`) to absolute paths using `std::fs::canonicalize()` before Docker mount configuration
- Example: `--mount ./data:/app/data` → `/home/user/project/data:/app/data`

## Dependencies (Cargo.toml)
```toml
tokio = { version = "1.0", features = ["full"] }
bollard = "0.15"
clap = { version = "4.0", features = ["derive"] }
futures-util = "0.3"
anyhow = "1.0"
```

## Testing Commands
```bash
# Basic echo test - verify transparent passthrough
echo "hello" | cargo run -- --image alpine -- sh -c "cat"
# Expected: "hello" (no Docker logs)

# MCP JSON simulation
echo '{"jsonrpc": "2.0", "method": "initialize"}' | cargo run -- --image my-mcp-image
# Expected: JSON response only
```

## Error Handling Strategy
- Never `panic!` on Docker daemon errors or missing images
- Print clear error messages to `stderr` and exit with code 1
- Example: `eprintln!("Error: Docker daemon not running"); process::exit(1);`

## Security Notes
- Do NOT enable `privileged` mode by default
- Container isolation is the primary security boundary

## Reference
See [SPEC.md](../SPEC.md) for complete specification and acceptance criteria.
