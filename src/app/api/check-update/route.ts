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

/**
 * How long a GitHub response is reused.
 *
 * This was an hour, which combined with the client's six-hourly poll meant a
 * freshly published release could stay invisible for seven hours — the app
 * would sit there insisting it was up to date. Releases are cheap to check and
 * GitHub allows 60 unauthenticated requests an hour, so a few minutes is
 * plenty of protection against hammering the API.
 */
const CACHE_SECONDS = 300;

export async function GET(req: Request) {
    try {
        // `?force=1` skips the cache entirely, for an explicit "check now".
        const force = new URL(req.url).searchParams.get("force") === "1";

        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { Accept: "application/vnd.github+json" },
            ...(force ? { cache: "no-store" as const } : { next: { revalidate: CACHE_SECONDS } }),
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
