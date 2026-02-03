#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { exec, spawn, ChildProcess } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { zodToJsonSchema } from "zod-to-json-schema";
import { promisify } from "util";

const execAsync = promisify(exec);

// --- State Management ---

interface ProcessInfo {
  pid: string;
  command: string;
  startTime: string;
  process: ChildProcess;
  stdout: string[];
  stderr: string[];
}

const processMap = new Map<string, ProcessInfo>();

// --- Server Initialization ---

const server = new Server(
  {
    name: "mcp-agent",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: { subscribe: true },
      tools: {},
    },
  }
);

// --- Resources ---

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "internal://processes/list",
        name: "Running Background Processes",
        mimeType: "application/json",
        description: "Returns a dynamic JSON list of all active processes managed by the agent.",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "internal://processes/list") {
    const processes = Array.from(processMap.values()).map((p) => ({
      pid: p.pid,
      command: p.command,
      startTime: p.startTime,
      status: p.process.exitCode === null ? "running" : "exited",
    }));
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(processes, null, 2),
        },
      ],
    };
  }
  throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${request.params.uri}`);
});

server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    if (request.params.uri === "internal://processes/list") {
        return {};
    }
     throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${request.params.uri}`);
});

function notifyProcessesUpdated() {
    server.notification({
        method: "notifications/resources/updated",
        params: { uri: "internal://processes/list" },
    });
}


// --- Tools ---

const BaseToolSchema = {
    // Shared schemas
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Shell Tools
      {
        name: "run_command",
        description: "Run a command that finishes quickly (e.g., `ls`, `git status`).",
        inputSchema: zodToJsonSchema(z.object({
          command: z.string(),
          cwd: z.string().optional(),
          timeout_ms: z.number().default(30000),
        })),
      },
      {
        name: "start_process",
        description: "Start a long-running task (e.g., `npm run dev`, `python server.py`).",
        inputSchema: zodToJsonSchema(z.object({
          command: z.string(),
          cwd: z.string().optional(),
        })),
      },
      {
        name: "read_process_output",
        description: "Get the latest logs from a background process.",
        inputSchema: zodToJsonSchema(z.object({
          pid: z.string(),
        })),
      },
      {
        name: "kill_process",
        description: "Stop a background task.",
        inputSchema: zodToJsonSchema(z.object({
          pid: z.string(),
        })),
      },

      // Filesystem Tools
      {
        name: "search_files",
        description: "Recursively search for files/directories that match or do not match patterns using `rg`.",
        inputSchema: zodToJsonSchema(z.object({
          path: z.string(),
          pattern: z.string(),
          excludePatterns: z.array(z.string()).optional(),
        })),
      },
      {
        name: "directory_tree",
        description: "Get recursive JSON tree structure of directory contents using `tree`.",
        inputSchema: zodToJsonSchema(z.object({
          path: z.string(),
          excludePatterns: z.array(z.string()).optional(),
        })),
      },
      {
        name: "read_text_file",
        description: "Read complete contents of a file as text.",
        inputSchema: zodToJsonSchema(z.object({
          path: z.string(),
          head: z.number().optional(),
          tail: z.number().optional(),
        })),
      },
      {
        name: "write_file",
        description: "Create new file or overwrite existing.",
        inputSchema: zodToJsonSchema(z.object({
          path: z.string(),
          content: z.string(),
        })),
      },
       {
        name: "create_directory",
        description: "Create new directory or ensure it exists.",
        inputSchema: zodToJsonSchema(z.object({
          path: z.string(),
        })),
      },
      {
          name: "list_directory",
          description: "List directory contents.",
          inputSchema: zodToJsonSchema(z.object({
              path: z.string(),
          }))
      },
      {
          name: "move_file",
          description: "Move or rename files and directories.",
          inputSchema: zodToJsonSchema(z.object({
              source: z.string(),
              destination: z.string(),
          }))
      },
       {
          name: "get_file_info",
          description: "Get detailed file/directory metadata.",
          inputSchema: zodToJsonSchema(z.object({
              path: z.string(),
          }))
      },
      {
        name: "edit_file",
        description: "Make selective edits using advanced pattern matching. Use dryRun first.",
        inputSchema: zodToJsonSchema(z.object({
            path: z.string(),
            edits: z.array(z.object({
                oldText: z.string(),
                newText: z.string(),
            })),
            dryRun: z.boolean().default(false),
        }))
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // --- Shell Tools ---
    if (name === "run_command") {
      const { command, cwd, timeout_ms } = z.object({
          command: z.string(),
          cwd: z.string().optional(),
          timeout_ms: z.number().default(30000),
      }).parse(args);

      try {
        const { stdout, stderr } = await execAsync(command, { cwd, timeout: timeout_ms });
        return { content: [{ type: "text", text: JSON.stringify({ stdout, stderr, exit_code: 0 }) }] };
      } catch (error: any) {
         return { content: [{ type: "text", text: JSON.stringify({ 
             stdout: error.stdout || "", 
             stderr: error.stderr || error.message, 
             exit_code: error.code || 1 
         }) }] };
      }
    }

    if (name === "start_process") {
       const { command, cwd } = z.object({
          command: z.string(),
          cwd: z.string().optional(),
      }).parse(args);

      const pid = uuidv4();
      const child = spawn(command, { cwd, shell: true });

      const processInfo: ProcessInfo = {
          pid,
          command,
          startTime: new Date().toISOString(),
          process: child,
          stdout: [],
          stderr: [],
      };

      child.stdout.on("data", (data) => {
          processInfo.stdout.push(data.toString());
      });

      child.stderr.on("data", (data) => {
          processInfo.stderr.push(data.toString());
      });

      child.on("close", (code) => {
         notifyProcessesUpdated();
      });

      processMap.set(pid, processInfo);
      notifyProcessesUpdated();

      return { content: [{ type: "text", text: JSON.stringify({ pid }) }] };
    }

    if (name === "read_process_output") {
        const { pid } = z.object({ pid: z.string() }).parse(args);
        const processInfo = processMap.get(pid);

        if (!processInfo) {
            throw new McpError(ErrorCode.InvalidRequest, `Process ${pid} not found`);
        }

        const stdout = processInfo.stdout.join("");
        const stderr = processInfo.stderr.join("");
        
        // Clear buffers
        processInfo.stdout = [];
        processInfo.stderr = [];

        return { content: [{ type: "text", text: JSON.stringify({ stdout, stderr }) }] };
    }

     if (name === "kill_process") {
        const { pid } = z.object({ pid: z.string() }).parse(args);
        const processInfo = processMap.get(pid);

         if (!processInfo) {
            throw new McpError(ErrorCode.InvalidRequest, `Process ${pid} not found`);
        }

        processInfo.process.kill('SIGTERM');
        processMap.delete(pid);
        notifyProcessesUpdated();

        return { content: [{ type: "text", text: "Process killed" }] };
     }


    // --- Filesystem Tools ---

    if (name === "search_files") {
         const { path: searchPath, pattern, excludePatterns } = z.object({
            path: z.string(),
            pattern: z.string(),
            excludePatterns: z.array(z.string()).optional(),
         }).parse(args);

         // Use rg
         let rgArgs = ["-n", "--no-heading", "--color", "never", pattern, searchPath];
         if (excludePatterns) {
             for (const p of excludePatterns) {
                 rgArgs.push("-g", `!${p}`);
             }
         }

         return new Promise((resolve, reject) => {
             const rg = spawn("rg", rgArgs);
             let stdout = "";
             let stderr = "";

             rg.stdout.on("data", (data) => stdout += data.toString());
             rg.stderr.on("data", (data) => stderr += data.toString());

             rg.on("close", (code) => {
                 if (code === 0 || code === 1) { // 1 means no matches found, which is valid
                      resolve({ content: [{ type: "text", text: stdout }] });
                 } else {
                      resolve({ content: [{ type: "text", text: `Error: ${stderr}` }], isError: true });
                 }
             });
             rg.on("error", (err) => resolve({ content: [{ type: "text", text: err.message }], isError: true }));
         });
    }

    if (name === "directory_tree") {
         const { path: treePath, excludePatterns } = z.object({
            path: z.string(),
            excludePatterns: z.array(z.string()).optional(),
         }).parse(args);

         // Use tree -J
         let treeArgs = ["-J", treePath];
          if (excludePatterns) {
             for (const p of excludePatterns) {
                 treeArgs.push("-I", p);
             }
         }

         return new Promise((resolve, reject) => {
             const tree = spawn("tree", treeArgs);
             let stdout = "";
             let stderr = "";

             tree.stdout.on("data", (data) => stdout += data.toString());
             tree.stderr.on("data", (data) => stderr += data.toString());

             tree.on("close", (code) => {
                  resolve({ content: [{ type: "text", text: stdout }] }); // stdout is JSON array from tree -J
             });
              tree.on("error", (err) => resolve({ content: [{ type: "text", text: err.message }], isError: true }));

         });
    }

    if (name === "read_text_file") {
        const { path: filePath, head, tail } = z.object({
          path: z.string(),
          head: z.number().optional(),
          tail: z.number().optional()
        }).parse(args);
        
        let content = await fs.readFile(filePath, "utf-8");
        const lines = content.split('\n');
        
        if (head) {
            content = lines.slice(0, head).join('\n');
        } else if (tail) {
            content = lines.slice(-tail).join('\n');
        }

        return { content: [{ type: "text", text: content }] };
    }

    if (name === "write_file") {
        const { path: filePath, content } = z.object({
          path: z.string(),
          content: z.string()
        }).parse(args);
        
        await fs.writeFile(filePath, content, "utf-8");
        return { content: [{ type: "text", text: `Successfully wrote to ${filePath}` }] };
    }

    if (name === "create_directory") {
        const { path: dirPath } = z.object({ path: z.string() }).parse(args);
        await fs.mkdir(dirPath, { recursive: true });
        return { content: [{ type: "text", text: `Successfully created directory ${dirPath}` }] };
    }

    if (name === "list_directory") {
         const { path: dirPath } = z.object({ path: z.string() }).parse(args);
         const entries = await fs.readdir(dirPath, { withFileTypes: true });
         const output = entries.map(e => `[${e.isDirectory() ? "DIR" : "FILE"}] ${e.name}`).join('\n');
         return { content: [{ type: "text", text: output }] };
    }
    
    if (name === "move_file") {
        const { source, destination } = z.object({ source: z.string(), destination: z.string() }).parse(args);
        await fs.rename(source, destination);
         return { content: [{ type: "text", text: `Successfully moved ${source} to ${destination}` }] };
    }
    
    if (name === "get_file_info") {
         const { path: filePath } = z.object({ path: z.string() }).parse(args);
         const stats = await fs.stat(filePath);
         const info = {
             size: stats.size,
             created: stats.birthtime,
             modified: stats.mtime,
             accessed: stats.atime,
             type: stats.isDirectory() ? "directory" : "file",
             permissions: stats.mode
         };
         return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
    }

    if (name === "edit_file") {
         const { path: filePath, edits, dryRun } = z.object({
            path: z.string(),
            edits: z.array(z.object({
                oldText: z.string(),
                newText: z.string(),
            })),
            dryRun: z.boolean().default(false),
        }).parse(args);

        let content = await fs.readFile(filePath, "utf-8");
        let modifiedContent = content;
        let diff = [];

        for (const edit of edits) {
            if (modifiedContent.includes(edit.oldText)) {
                modifiedContent = modifiedContent.replace(edit.oldText, edit.newText);
                diff.push(`MATCH FOUND: \n${edit.oldText}\nREPLACING WITH:\n${edit.newText}`);
            } else {
                 diff.push(`MATCH FAILED: Could not find \n${edit.oldText}`);
                 if (!dryRun) throw new McpError(ErrorCode.InvalidParams, `Could not find text in file`);
            }
        }
        
        if (dryRun) {
             return { content: [{ type: "text", text: "DRY RUN RESULTS:\n" + diff.join('\n---\n') }] };
        } else {
             await fs.writeFile(filePath, modifiedContent, "utf-8");
             return { content: [{ type: "text", text: `Applied ${edits.length} edits to ${filePath}` }] };
        }
    }


    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);

  } catch (error: any) {
    if (error instanceof z.ZodError) {
       throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${JSON.stringify(error.errors)}`);
    }
    throw error;
  }
});

// Helper for zod to json schema (simplistic version as SDK usually handles this if using addTool, but here we are using setRequestHandler with raw JSON)
// Actually the SDK doesn't export zodToJsonSchema, we have to do it or use a library.
// For simplicity in this "all-in-one" file, I will use a simple helper or just rely on 'zod-to-json-schema' if I could install it.
// The prompt said "Setup package.json with @modelcontextprotocol/sdk and zod". It didn't mention zod-to-json-schema.
// I will implement a basic strictly-typed schema generator or just hardcode the JSON schemas if needed, 
// BUT the SDK's `inputSchema` expects a JSON Schema object.
// I will import `zod-to-json-schema` in the code, but I need to make sure it's in package.json.
// Wait, I missed adding `zod-to-json-schema` to package.json.
// I will just implement a very basic manual schema generation for the purpose of this task 
// OR I can quickly update package.json. Updating package.json is safer.

// Let's assume I need to update package.json first.
// I will stop this Write and update package.json.
// Actually, I can just use a helper function here to keep it simple and dependency-free if possible,
// but for complex objects it's annoying.
// I'll assume users have `zod-to-json-schema` or I can just write the schemas manually in the ListTools response.
// Writing schemas manually is annoying but reliable without extra deps.
// I'll used `zod-to-json-schema` and update package.json.

// Wait, I am currently inside the write_file tool call. I cannot stop it.
// I will write the file assuming `zod-to-json-schema` is available, and then I will update package.json immediately after.
// REVISION: I will use a simple inline helper to convert Zod to JSON schema for the simple types used here.

// Helper removed in favor of zod-to-json-schema package


// I will rewrite the ListTools handler to use manual JSON schemas for now to avoid the dependency.

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
