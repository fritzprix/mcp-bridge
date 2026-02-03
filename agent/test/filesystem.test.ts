import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
    readTextFileTool, 
    writeFileTool, 
    createDirectoryTool,
    listDirectoryTool
} from "../src/tools/filesystem";
import * as fs from "fs/promises";

vi.mock("fs/promises");
vi.mock("child_process");

describe("Filesystem Tools", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should write file content", async () => {
        const path = "/test/file.txt";
        const content = "hello world";
        
        const result = await writeFileTool.handler({ path, content });
        
        expect(fs.writeFile).toHaveBeenCalledWith(path, content, "utf-8");
        expect(result.content[0].text).toContain("Successfully wrote");
    });

    it("should read text file", async () => {
        const path = "/test/file.txt";
        vi.mocked(fs.readFile).mockResolvedValue("line1\nline2\nline3");

        const result = await readTextFileTool.handler({ path });

        expect(fs.readFile).toHaveBeenCalledWith(path, "utf-8");
        expect(result.content[0].text).toBe("line1\nline2\nline3");
    });

    it("should create directory", async () => {
        const path = "/test/dir";
        const result = await createDirectoryTool.handler({ path });

        expect(fs.mkdir).toHaveBeenCalledWith(path, { recursive: true });
        expect(result.content[0].text).toContain("Successfully created directory");
    });
});
