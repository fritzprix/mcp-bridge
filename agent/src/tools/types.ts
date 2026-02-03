import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any; // Using any for Zod schema output
  handler: (args: any) => Promise<any>;
}
