import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET() {
    try {
        // Use osascript to open a native macOS folder picker dialog
        const { stdout } = await execAsync(
            `osascript -e 'set folderPath to POSIX path of (choose folder with prompt "Select Watch Folder")' -e 'return folderPath'`
        );
        const selectedPath = stdout.trim();

        if (!selectedPath) {
            return NextResponse.json({ error: "No folder selected" }, { status: 400 });
        }

        return NextResponse.json({ path: selectedPath });
    } catch (error: any) {
        // User cancelled the dialog
        if (error.message?.includes("User canceled")) {
            return NextResponse.json({ cancelled: true });
        }
        return NextResponse.json(
            { error: "Failed to open folder picker", details: error.message },
            { status: 500 }
        );
    }
}
