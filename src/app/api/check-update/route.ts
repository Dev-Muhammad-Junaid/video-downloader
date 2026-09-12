import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

const REPO = "Dev-Muhammad-Junaid/SnapDown";

/** "v1.2.3" or "1.2.3" -> [1,2,3]. Non-numeric parts sort as 0. */
function parseVersion(v: string): number[] {
    return v.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
}

/** true if `a` is strictly newer than `b`. */
function isNewer(a: string, b: string): boolean {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
}

export async function GET() {
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { Accept: "application/vnd.github+json" },
            // Releases don't change often; avoid hammering GitHub's API on every check.
            next: { revalidate: 3600 },
        });

        if (!res.ok) {
            // No releases published yet (404) or GitHub API hiccup — not an
            // error a user needs to see, just "no update info available".
            return NextResponse.json({ updateAvailable: false, currentVersion: packageJson.version });
        }

        const release = await res.json();
        const latestVersion: string = release.tag_name || "";
        const dmgAsset = (release.assets || []).find((a: { name: string }) => a.name.endsWith(".dmg"));

        return NextResponse.json({
            currentVersion: packageJson.version,
            latestVersion,
            updateAvailable: latestVersion ? isNewer(latestVersion, packageJson.version) : false,
            changelog: release.body || "",
            releaseUrl: release.html_url,
            downloadUrl: dmgAsset?.browser_download_url || release.html_url,
            publishedAt: release.published_at,
        });
    } catch (error) {
        console.error("Update check failed:", error);
        return NextResponse.json({ updateAvailable: false, currentVersion: packageJson.version });
    }
}
