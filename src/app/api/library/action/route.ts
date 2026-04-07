import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

export async function POST(req: Request) {
    try {
        const { action, targetPath } = await req.json();

        if (!targetPath) {
            return NextResponse.json({ error: "Path is required" }, { status: 400 });
        }

        if (action === "open") {
            const platform = os.platform();
            const dir = path.dirname(targetPath);

            if (platform === "darwin") {
                await execFileAsync("open", ["-R", targetPath]);
            } else if (platform === "win32") {
                await execFileAsync("explorer", ["/select,", targetPath]);
            } else {
                await execFileAsync("xdg-open", [dir]);
            }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        console.error("Failed to execute native action:", error);
        return NextResponse.json({ error: "Failed to open explorer" }, { status: 500 });
    }
}
