import { z } from "zod";
import * as fs from "fs/promises";
import { spawn } from "child_process";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolDefinition } from "./types.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description: "Recursively search for files/directories that match or do not match patterns using `rg`.",
  inputSchema: zodToJsonSchema(z.object({
    path: z.string(),
    pattern: z.string(),
    excludePatterns: z.array(z.string()).optional(),
  })),
  handler: async (args: any) => {
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
};

export const directoryTreeTool: ToolDefinition = {
  name: "directory_tree",
  description: "Get recursive JSON tree structure of directory contents using `tree`.",
  inputSchema: zodToJsonSchema(z.object({
    path: z.string(),
    excludePatterns: z.array(z.string()).optional(),
  })),
  handler: async (args: any) => {
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
};

export const readTextFileTool: ToolDefinition = {
  name: "read_text_file",
  description: "Read complete contents of a file as text.",
  inputSchema: zodToJsonSchema(z.object({
    path: z.string(),
    head: z.number().optional(),
    tail: z.number().optional(),
  })),
  handler: async (args: any) => {
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
};

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Create new file or overwrite existing.",
  inputSchema: zodToJsonSchema(z.object({
    path: z.string(),
    content: z.string(),
  })),
  handler: async (args: any) => {
      const { path: filePath, content } = z.object({
        path: z.string(),
        content: z.string()
      }).parse(args);
      
      await fs.writeFile(filePath, content, "utf-8");
      return { content: [{ type: "text", text: `Successfully wrote to ${filePath}` }] };
  }
};

export const createDirectoryTool: ToolDefinition = {
  name: "create_directory",
  description: "Create new directory or ensure it exists.",
  inputSchema: zodToJsonSchema(z.object({
    path: z.string(),
  })),
  handler: async (args: any) => {
      const { path: dirPath } = z.object({ path: z.string() }).parse(args);
      await fs.mkdir(dirPath, { recursive: true });
      return { content: [{ type: "text", text: `Successfully created directory ${dirPath}` }] };
  }
};

export const listDirectoryTool: ToolDefinition = {
    name: "list_directory",
    description: "List directory contents.",
    inputSchema: zodToJsonSchema(z.object({
        path: z.string(),
    })),
    handler: async (args: any) => {
         const { path: dirPath } = z.object({ path: z.string() }).parse(args);
         const entries = await fs.readdir(dirPath, { withFileTypes: true });
         const output = entries.map(e => `[${e.isDirectory() ? "DIR" : "FILE"}] ${e.name}`).join('\n');
         return { content: [{ type: "text", text: output }] };
    }
};

export const moveFileTool: ToolDefinition = {
    name: "move_file",
    description: "Move or rename files and directories.",
    inputSchema: zodToJsonSchema(z.object({
        source: z.string(),
        destination: z.string(),
    })),
    handler: async (args: any) => {
        const { source, destination } = z.object({ source: z.string(), destination: z.string() }).parse(args);
        await fs.rename(source, destination);
         return { content: [{ type: "text", text: `Successfully moved ${source} to ${destination}` }] };
    }
};

export const getFileInfoTool: ToolDefinition = {
    name: "get_file_info",
    description: "Get detailed file/directory metadata.",
    inputSchema: zodToJsonSchema(z.object({
        path: z.string(),
    })),
    handler: async (args: any) => {
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
};

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description: "Make selective edits using advanced pattern matching. Use dryRun first.",
  inputSchema: zodToJsonSchema(z.object({
      path: z.string(),
      edits: z.array(z.object({
          oldText: z.string(),
          newText: z.string(),
      })),
      dryRun: z.boolean().default(false),
  })),
  handler: async (args: any) => {
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
};

export const filesystemTools = [
    searchFilesTool,
    directoryTreeTool,
    readTextFileTool,
    writeFileTool,
    createDirectoryTool,
    listDirectoryTool,
    moveFileTool,
    getFileInfoTool,
    editFileTool
];
