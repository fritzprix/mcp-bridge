#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { shellTools, processMap } from "./tools/shell.js";
import { filesystemTools } from "./tools/filesystem.js";

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

// --- Tools ---

const allTools = [...shellTools, ...filesystemTools];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = allTools.find(t => t.name === name);

  if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  try {
      return await tool.handler(args);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
       throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${JSON.stringify(error.errors)}`);
    }
    throw error;
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
