import { z } from "zod";
import { exec, spawn, ChildProcess } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { promisify } from "util";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolDefinition } from "./types.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

const execAsync = promisify(exec);

export interface ProcessInfo {
  pid: string;
  command: string;
  startTime: string;
  process: ChildProcess;
  stdout: string[];
  stderr: string[];
}

export const processMap = new Map<string, ProcessInfo>();

export const runCommandTool: ToolDefinition = {
  name: "run_command",
  description: "Run a command that finishes quickly (e.g., `ls`, `git status`).",
  inputSchema: zodToJsonSchema(z.object({
    command: z.string(),
    cwd: z.string().optional(),
    timeout_ms: z.number().default(30000),
  })),
  handler: async (args: any) => {
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
};

export const startProcessTool: ToolDefinition = {
  name: "start_process",
  description: "Start a long-running task (e.g., `npm run dev`, `python server.py`).",
  inputSchema: zodToJsonSchema(z.object({
    command: z.string(),
    cwd: z.string().optional(),
  })),
  handler: async (args: any) => {
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
         // Notify would happen in main server logic usually, 
         // but here we just update state. 
         // Real notification should be handled by a callback or event if we want full decouple.
      });

      processMap.set(pid, processInfo);
      return { content: [{ type: "text", text: JSON.stringify({ pid }) }] };
  }
};

export const readProcessOutputTool: ToolDefinition = {
  name: "read_process_output",
  description: "Get the latest logs from a background process.",
  inputSchema: zodToJsonSchema(z.object({
    pid: z.string(),
  })),
  handler: async (args: any) => {
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
};

export const killProcessTool: ToolDefinition = {
  name: "kill_process",
  description: "Stop a background task.",
  inputSchema: zodToJsonSchema(z.object({
    pid: z.string(),
  })),
  handler: async (args: any) => {
      const { pid } = z.object({ pid: z.string() }).parse(args);
      const processInfo = processMap.get(pid);

       if (!processInfo) {
          throw new McpError(ErrorCode.InvalidRequest, `Process ${pid} not found`);
      }

      processInfo.process.kill('SIGTERM');
      processMap.delete(pid);

      return { content: [{ type: "text", text: "Process killed" }] };
   }
};

export const shellTools = [runCommandTool, startProcessTool, readProcessOutputTool, killProcessTool];
