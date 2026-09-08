import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { getYtdlpCookieArgs } from "@/lib/settings";
import { getYtdlpPath, describeYtdlpError } from "@/lib/ytdlp";

const execFileAsync = promisify(execFile);

import { GALLERY_DL_PATH } from "@/lib/gallery-dl";

export async function POST(req: Request) {
    try {
        let { url } = await req.json();

        if (!url) {
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }

        // Check for playlist first
        try {
            // Check if we are already requesting a specific item from a playlist to avoid recursion
            const parsedInputUrl = new URL(url);
            const playlistItemMatch = parsedInputUrl.searchParams.get("snapdown_playlist_item");
            
            let playlistOut = "";
            if (!playlistItemMatch) {
                const { stdout } = await execFileAsync(getYtdlpPath(), [...getYtdlpCookieArgs(), "--flat-playlist", "-j", "--", url], { timeout: 15000 });
                playlistOut = stdout;
            }

            if (playlistOut) {
                const playlistLines = playlistOut.trim().split("\n").filter(Boolean);
                
                if (playlistLines.length > 1) {
                    // This is a playlist!
                    const items = [];
                    let playlistTitle = "Playlist";
                    
                    let index = 1;
                    for (const line of playlistLines) {
                        try {
                            const entry = JSON.parse(line);
                            if (entry._type === "playlist" && entry.title) {
                                playlistTitle = entry.title;
                                continue;
                            }
                            
                            let itemUrl = entry.url || entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`;
                            const entryIndex = entry.playlist_index || index;
                            
                            // Prevent infinite loops where the item URL is exactly the parent URL (e.g. Twitter threads)
                            // We append a custom query param so next time we know to target this exact item index
                            if (itemUrl === url || itemUrl === entry.webpage_url) {
                                const separator = itemUrl.includes('?') ? '&' : '?';
                                itemUrl = `${itemUrl}${separator}snapdown_playlist_item=${entryIndex}`;
                            }

                            items.push({
                                id: entry.id || entry.url || `playlist_item_${entryIndex}`,
                                title: entry.title || `Item ${index}`,
                                url: itemUrl,
                                duration: entry.duration || null,
                                thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail || null,
                            });
                            index++;
                        } catch { }
                    }

                    if (items.length > 1) {
                        return NextResponse.json({
                            isPlaylist: true,
                            playlistTitle,
                            itemCount: items.length,
                            items,
                            mediaType: "video",
                        });
                    }
                }
            }
        } catch {
            // Not a playlist or yt-dlp doesn't support flat-playlist for this URL
        }

        // Check if we need to target a specific item index from our custom parameter
        let targetItemIndex = "";
        try {
            const parsedUrl = new URL(url);
            const playlistItem = parsedUrl.searchParams.get("snapdown_playlist_item");
            if (playlistItem) {
                targetItemIndex = playlistItem;
                parsedUrl.searchParams.delete("snapdown_playlist_item");
                url = parsedUrl.toString();
            }
        } catch { }

        // Try yt-dlp first (works for videos)
        try {
            const ytdlpArgs: string[] = [...getYtdlpCookieArgs()];
            if (targetItemIndex) {
                ytdlpArgs.push("-I", targetItemIndex);
            }
            ytdlpArgs.push("-j", "--", url);
            const { stdout } = await execFileAsync(getYtdlpPath(), ytdlpArgs);
            const lines = stdout.trim().split("\n");
            // If we extracted multiple lines (e.g. still an array), take the first one since we used -I
            const metadata = JSON.parse(lines[0]);

            // Parse available formats
            const formats: { formatId: string; label: string; ext: string; resolution: string | null; filesize: number | null; note: string }[] = [];
            
            if (metadata.formats && Array.isArray(metadata.formats)) {
                // Group formats into quality tiers
                const seen = new Set<string>();
                
                for (const fmt of metadata.formats) {
                    if (!fmt.format_id) continue;
                    const hasVideo = fmt.vcodec && fmt.vcodec !== "none";
                    const hasAudio = fmt.acodec && fmt.acodec !== "none";
                    const height = fmt.height || 0;
                    const ext = fmt.ext || "mp4";
                    
                    let label = "";
                    let key = "";
                    
                    if (hasVideo && hasAudio) {
                        label = height ? `${height}p (${ext})` : `Video+Audio (${ext})`;
                        key = `combo-${height}-${ext}`;
                    } else if (hasVideo) {
                        label = height ? `${height}p video only (${ext})` : `Video only (${ext})`;
                        key = `video-${height}-${ext}`;
                    } else if (hasAudio) {
                        const abr = fmt.abr ? `${Math.round(fmt.abr)}kbps` : "";
                        label = `Audio only ${abr} (${ext})`;
                        key = `audio-${fmt.abr || 0}-${ext}`;
                    } else {
                        continue;
                    }
                    
                    if (seen.has(key)) continue;
                    seen.add(key);
                    
                    formats.push({
                        formatId: fmt.format_id,
                        label,
                        ext,
                        resolution: height ? `${height}p` : null,
                        filesize: fmt.filesize || fmt.filesize_approx || null,
                        note: fmt.format_note || "",
                    });
                }
                
                // Sort: combo formats first, then by resolution descending
                formats.sort((a, b) => {
                    const aCombo = a.label.includes("video only") || a.label.includes("Audio only") ? 1 : 0;
                    const bCombo = b.label.includes("video only") || b.label.includes("Audio only") ? 1 : 0;
                    if (aCombo !== bCombo) return aCombo - bCombo;
                    const aRes = parseInt(a.resolution || "0");
                    const bRes = parseInt(b.resolution || "0");
                    return bRes - aRes;
                });
            }

            return NextResponse.json({
                id: metadata.id,
                title: metadata.title,
                duration: metadata.duration,
                originalUrl: metadata.webpage_url || url,
                sourcePlatform: metadata.extractor,
                thumbnail: metadata.thumbnail,
                viewCount: metadata.view_count,
                mediaType: "video",
                formats,
            });
        } catch (ytdlpError: any) {
            // A recognizable failure (bot-check, private/unavailable video, etc.)
            // is a real, terminal answer from yt-dlp — surface it directly
            // instead of silently falling through to gallery-dl (which doesn't
            // support YouTube anyway) and showing an unrelated, confusing error.
            const knownReason = describeYtdlpError(ytdlpError?.stderr || "");
            if (knownReason) {
                return NextResponse.json({ error: knownReason }, { status: 422 });
            }
            console.log("yt-dlp failed, trying gallery-dl for image extraction...");
        }

        // Fallback: gallery-dl for image-only posts
        try {
            const { stdout } = await execFileAsync(GALLERY_DL_PATH, ["-j", "--", url]);

            // gallery-dl -j outputs a JSON array of entries:
            // [2, {directory_metadata}]  — directory/metadata info
            // [3, "https://image_url"]   — actual image URL
            const data = JSON.parse(stdout);

            let imageUrl = "";
            let title = "";
            let platform = "unknown";

            for (const entry of data) {
                if (!Array.isArray(entry)) continue;

                // Type 2: directory metadata — extract title/content
                if (entry[0] === 2 && typeof entry[1] === "object") {
                    const meta = entry[1];
                    title = meta.content || meta.description || meta.tweet_id?.toString() || "Image";
                    if (title.length > 100) title = title.substring(0, 100) + "...";
                    platform = meta.subcategory || meta.category || "twitter";
                }

                // Type 3: image URL
                if (entry[0] === 3 && typeof entry[1] === "string" && entry[1].startsWith("http")) {
                    imageUrl = entry[1];
                }
            }

            if (!imageUrl) {
                return NextResponse.json(
                    { error: "No downloadable media found at this URL" },
                    { status: 400 }
                );
            }

            return NextResponse.json({
                id: imageUrl,
                title,
                duration: null,
                originalUrl: url,
                sourcePlatform: platform,
                thumbnail: imageUrl,
                viewCount: null,
                mediaType: "image",
                imageUrl,
            });
        } catch (galleryError: any) {
            console.error("gallery-dl also failed:", galleryError.message);
            return NextResponse.json(
                { error: "Failed to extract media information", details: galleryError.message },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error("Failed to extract preview:", error);
        return NextResponse.json(
            { error: "Failed to extract media information", details: error.message },
            { status: 500 }
        );
    }
}
