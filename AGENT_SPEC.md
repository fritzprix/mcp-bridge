Here is the completely rewritten **`AGENT_SPEC.md`** in English, incorporating all your requirements: **lightweight Alpine Linux**, **essential dev tools**, **shell capabilities**, **filesystem operations**, and **dynamic resources**.

You can save this file and pass it to your Coding Agent along with the `filesystem.md` (the README you provided earlier).

---

# AGENT_SPEC.md

## 1. Project Overview

We are building a **"Batteries-Included" MCP (Model Context Protocol) Server** designed to run inside a **Dockerized environment**.
This agent acts as the bridge between an LLM and the container's isolated environment, providing three core capabilities:

1. **Shell Execution:** Running synchronous commands and managing long-running background processes.
2. **Filesystem Operations:** Full manipulation of files (Read, Write, Edit, Search) based on the standard MCP Filesystem spec.
3. **System Observation:** Exposing internal state (process list) via dynamic MCP Resources.

## 2. Infrastructure (Dockerfile)

The Docker image must be lightweight (Alpine) yet powerful enough for software development tasks.

* **Base Image:** `node:20-alpine`
* **Optimization:** Use a multi-stage build (Builder vs. Runtime) to minimize image size.
* **Essential System Tools (Must be installed in Runtime stage):**
* `ripgrep` (rg): For ultra-fast code searching (replaces `grep`).
* `fd`: For fast file finding (replaces `find`).
* `git`: For version control and diff patching.
* `tree`: For visualizing directory structures.
* `curl`, `wget`, `jq`: For network and JSON utilities.
* `make`, `g++`, `python3`: For building native dependencies.
* `openssh-client`, `zip`, `unzip`, `tar`.


* **Environment:**
* `WORKDIR`: `/workspace` (This will be the mount point for the host project).



## 3. Server Architecture (`src/index.ts`)

* **Runtime:** Node.js / TypeScript.
* **Library:** `@modelcontextprotocol/sdk`.
* **Transport:** `StdioServerTransport`.
* **State Management:**
* Maintain a global in-memory map for background processes:
```typescript
const processMap = new Map<string, { process: ChildProcess, stdout: string[], stderr: string[] }>();

```




* **Logging Constraint:** **CRITICAL.** Never log to `stdout` (it breaks JSON-RPC). All debug logs must go to `stderr`.

---

## 4. Capability Set A: Shell & Process Management

*Tools to execute commands and manage OS processes.*

### 4.1. `run_command` (Sync)

* **Purpose:** Run a command that finishes quickly (e.g., `ls`, `git status`).
* **Inputs:** `command` (string), `cwd` (optional), `timeout_ms` (default 30s).
* **Behavior:** Use `child_process.exec`. Wait for completion.
* **Output:** JSON object `{ stdout, stderr, exit_code }`.

### 4.2. `start_process` (Async)

* **Purpose:** Start a long-running task (e.g., `npm run dev`, `python server.py`).
* **Inputs:** `command` (string), `cwd` (optional).
* **Behavior:**
* Use `child_process.spawn`.
* Generate a unique **PID** (internal UUID).
* Store the child process reference and its `stdout/stderr` streams in `processMap`.
* **Trigger:** Notify subscribers that `internal://processes/list` has changed.


* **Output:** `{ pid: string }`.

### 4.3. `read_process_output` (Polling)

* **Purpose:** Get the latest logs from a background process.
* **Inputs:** `pid` (string).
* **Behavior:**
* Retrieve buffered logs from `processMap`.
* **Clear the buffer** after reading (Consume-once pattern to prevent memory leaks).


* **Output:** `{ stdout: string, stderr: string }`.

### 4.4. `kill_process`

* **Purpose:** Stop a background task.
* **Inputs:** `pid` (string).
* **Behavior:** Send `SIGTERM`, remove from `processMap`, and notify subscribers.

---

## 5. Capability Set B: Filesystem Operations

*Refer to `filesystem.md` for the detailed behavioral requirements.*

Implement the standard filesystem tools, but optimized for the Docker environment using the installed Alpine tools:

1. **`search_files`**:
* **Implementation:** Do NOT use slow Node.js recursion. **Execute `rg` (ripgrep)** via `child_process`.
* Command: `rg -n --no-heading --color never "{query}" "{path}"`


2. **`directory_tree`**:
* **Implementation:** **Execute `tree**` command.


3. **`edit_file`**:
* Implement the "Dry Run" and patch logic described in `filesystem.md`.


4. **`read_file`, `write_file`, `list_directory`, `move_file**`:
* Implement using standard Node.js `fs/promises`.
* **Security:** Restrict operations to the `/workspace` directory by default.



---

## 6. Capability Set C: Dynamic Resources

*Expose the agent's internal state as read-only resources.*

### 6.1. Process List Resource

* **URI:** `internal://processes/list`
* **Name:** "Running Background Processes"
* **MIME Type:** `application/json`
* **Description:** Returns a dynamic JSON list of all active processes managed by `processMap`.
* **Behavior:**
* On `read`: Serialize the metadata from `processMap` (PID, Command, StartTime, Status).
* **Subscription:** Support `subscribe`. Emit `notifications/resources/updated` whenever a process starts or stops.



---
