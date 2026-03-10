import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export async function POST(req: Request) {
    try {
        const { action, targetPath } = await req.json();

        if (!targetPath) {
            return NextResponse.json({ error: "Path is required" }, { status: 400 });
        }

        if (action === "open") {
            let command = "";
            const platform = os.platform();

            // We want to open the directory containing the file, and ideally select it
            // macOS: open -R <path>
            // Windows: explorer /select,"<path>"
            // Linux: xdg-open <dir>

            const dir = path.dirname(targetPath);

            if (platform === "darwin") {
                command = `open -R "${targetPath}"`;
            } else if (platform === "win32") {
                command = `explorer /select,"${targetPath}"`;
            } else {
                command = `xdg-open "${dir}"`;
            }

            await execAsync(command);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        console.error("Failed to execute native action:", error);
        return NextResponse.json({ error: "Failed to open explorer" }, { status: 500 });
    }
}
