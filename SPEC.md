# Project Specification: Dockerized MCP Bridge (Rust)

## 1. Overview
This project is an **MCP (Model Context Protocol) Bridge CLI** written in **Rust**.
It acts as a **proxy** to enable local host processes (e.g., Claude Desktop, Libr Agent) to communicate safely with MCP servers running inside an isolated Docker container environment.

## 2. Core Objectives
1.  **Isolation:** All MCP tool executions and file manipulations are performed inside the Docker container to protect the host system.
2.  **Transparency:** The host MCP client must not be aware that the tool is running inside Docker. (Seamless relay of Standard I/O).
3.  **Concurrency:** Support multiple simultaneous sessions using ephemeral containers with unique IDs.
4.  **Extensibility:** Support multiple volume mounts and environment variables via repeated CLI arguments.

## 3. Tech Stack
* **Language:** Rust (Edition 2021)
* **Async Runtime:** `tokio` (v1.0+, full features)
* **Docker Client:** `bollard` (v0.15+)
* **CLI Parser:** `clap` (derive features)
* **Stream Handling:** `futures-util`
* **Utilities:** `uuid` (v4, for unique container naming), `anyhow` (error handling)

## 4. Architecture & Data Flow

### Data Flow Diagram
```mermaid
Host Process (Stdin) -> Rust Wrapper -> Docker Attach (Stdin) -> MCP Server
MCP Server (Stdout)  -> Docker Attach (Stdout) -> Rust Wrapper -> Host Process (Stdout)
Rust Wrapper (Logs)  -> Host Process (Stderr)

```

### Core Components

1. **CLI Entrypoint:** Parses user inputs using `clap`.
2. **Container Lifecycle Manager:** Manages unique naming (UUID), creation, and guaranteed cleanup of containers.
3. **Stream Piper:** Asynchronously pipes Host Stdin/Stdout to Container Stdin/Stdout.
4. **Path Resolver:** Converts host relative paths to absolute paths for Docker volume mounting.

---

## 5. Implementation Phases

### Phase 1: Project Scaffolding & CLI Definition

* Initialize project: `cargo new mcp-bridge`
* Define `Args` struct using `clap`.
* **Critical Requirement for Arguments:**
* `--mount`: Must support **multiple occurrences** (e.g., `-v ./src:/src -v ./logs:/logs`).
* Implementation detail: Use `#[arg(action = clap::ArgAction::Append)]` to parse into `Vec<String>`.


* `--env`: Must support multiple occurrences.
* `--image`: Default to `mcp-server:latest`.



### Phase 2: Session Management & Container Lifecycle

* **Unique Naming:**
* Generate a `UUID v4` at startup.
* Container name must be formatted as `mcp-bridge-{uuid}` to allow parallel execution of multiple bridge instances without name collision.


* **Container Config:**
* `Tty: false` (**Critical**: To prevent PTY control characters from corrupting JSON-RPC).
* `OpenStdin: true`, `StdinOnce: true`.
* `AttachStdin`, `AttachStdout`, `AttachStderr` = `true`.


* **Guaranteed Cleanup (Drop Trait):**
* Implement the `Drop` trait for the Container Manager struct.
* Ensure `docker.remove_container` is called with `force: true` when the struct goes out of scope or the program terminates.



### Phase 3: I/O Stream Piping

* Use `docker.attach_container` to hijack the stream.
* Use `tokio::spawn` to handle bidirectional copying:
1. **Host Stdin → Container Stdin**
2. **Container Stdout → Host Stdout**


* **Log Separation:**
* Any logs from the Rust wrapper itself (e.g., "Starting container...") or Docker errors must go to **stderr**.
* **stdout** is reserved strictly for the MCP JSON payload.



### Phase 4: Path Resolution

* Iterate through the `Vec<String>` of mounts.
* Split Host/Container paths.
* Convert the **Host Path** part from relative (e.g., `.`) to absolute path using `std::fs::canonicalize`.
* Pass the resolved string to Docker HostConfig `Binds`.

### Phase 5: CI/CD (GitHub Actions)

* Create `.github/workflows/release.yml`.
* Configure **Cross-Compilation** to generate standalone binaries for:
* `x86_64-unknown-linux-musl` (Linux Static)
* `aarch64-apple-darwin` (macOS Apple Silicon)
* `x86_64-pc-windows-msvc` (Windows)


* Automatically upload binaries to GitHub Releases on tag push.

---

## 6. Critical Constraints for Agent

1. **Zero Noise on Stdout:** The bridge must be silent on stdout. Only the data from the container is allowed.
2. **Panic Safety:** Avoid unwrap() on runtime operations (like Docker connection). Use `anyhow::Result` to propagate errors and print them to stderr.
3. **Signal Handling:** Ensure `SIGINT` (Ctrl+C) is caught and triggers the cleanup logic (container removal).

## 7. Acceptance Criteria (Test Instructions)

**Test 1: Multi-Mount Support**

```bash
# Should echo "exist" if both paths are mounted correctly
cargo run -- \
  --image alpine \
  --mount ./dir1:/mnt/1 \
  --mount ./dir2:/mnt/2 \
  -- sh -c "ls /mnt/1 && ls /mnt/2"

```

**Test 2: Parallel Execution (UUID Check)**

```bash
# Run two instances in background. They should not fail with "name conflict".
cargo run -- --image alpine -- sleep 5 &
cargo run -- --image alpine -- sleep 5 &

```

**Test 3: MCP Protocol Compliance**

```bash
# Input generic JSON, expect identical JSON back (assuming echo server or similar)
echo '{"jsonrpc": "2.0"}' | cargo run -- --image alpine -- cat

```