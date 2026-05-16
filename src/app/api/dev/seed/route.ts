import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getDownloadsDir } from "@/lib/download-manager";

// Only available in development
const isDev = process.env.NODE_ENV !== "production";

// Workable yt-dlp URLs for queue testing (returned to the client, not downloaded server-side)
export const TEST_URLS = [
    // YouTube – short public domain clips
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",   // Me at the zoo (first YouTube video, 19s)
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ",   // Big Buck Bunny trailer (public domain)
    "https://www.youtube.com/watch?v=YE7VzlLtp-4",   // Big Buck Bunny full (public domain)
    // Vimeo – public domain
    "https://vimeo.com/1084537",                      // Elephants Dream (Blender open movie)
    // SoundCloud – CC-licensed audio
    "https://soundcloud.com/forss/flickermood",
];

interface SeedImageDef {
    filename: string;
    title: string;
    platform: string;
    // sharp SVG composite config
    width: number;
    height: number;
    bgHex: string;
    label: string;
}

const SEED_IMAGES: SeedImageDef[] = [
    { filename: "test_landscape_16x9.jpg",  title: "Test Image – Landscape 16:9",  platform: "Dev Seed", width: 1280, height: 720,  bgHex: "#1a6b8a", label: "16:9 Landscape" },
    { filename: "test_portrait_9x16.jpg",   title: "Test Image – Portrait 9:16",   platform: "Dev Seed", width: 720,  height: 1280, bgHex: "#6b1a8a", label: "9:16 Portrait"  },
    { filename: "test_square_1x1.jpg",      title: "Test Image – Square 1:1",      platform: "Dev Seed", width: 800,  height: 800,  bgHex: "#1a8a4b", label: "1:1 Square"   },
    { filename: "test_transparency.png",    title: "Test Image – PNG Transparency", platform: "Dev Seed", width: 600,  height: 400,  bgHex: "#8a6b1a", label: "PNG Alpha"    },
];

async function generateImage(def: SeedImageDef, destPath: string): Promise<void> {
    // Use dynamic import so sharp only loads server-side
    const sharp = (await import("sharp")).default;

    const isTransparency = def.filename.endsWith(".png") && def.label === "PNG Alpha";

    // Build an SVG with a coloured background and centered label text
    const svgBuf = Buffer.from(`
        <svg width="${def.width}" height="${def.height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${def.width}" height="${def.height}" fill="${def.bgHex}" rx="0"/>
            ${isTransparency ? `
                <!-- checkerboard hint for transparency test -->
                <rect x="${def.width * 0.15}" y="${def.height * 0.15}" width="${def.width * 0.7}" height="${def.height * 0.7}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-dasharray="12 8" rx="8"/>
            ` : ""}
            <!-- grid lines -->
            <line x1="${def.width / 3}" y1="0" x2="${def.width / 3}" y2="${def.height}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
            <line x1="${def.width * 2 / 3}" y1="0" x2="${def.width * 2 / 3}" y2="${def.height}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
            <line x1="0" y1="${def.height / 3}" x2="${def.width}" y2="${def.height / 3}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
            <line x1="0" y1="${def.height * 2 / 3}" x2="${def.width}" y2="${def.height * 2 / 3}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
            <!-- diagonal cross -->
            <line x1="0" y1="0" x2="${def.width}" y2="${def.height}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
            <line x1="${def.width}" y1="0" x2="0" y2="${def.height}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
            <!-- label box -->
            <rect x="${def.width / 2 - 140}" y="${def.height / 2 - 36}" width="280" height="72" fill="rgba(0,0,0,0.45)" rx="10"/>
            <text x="${def.width / 2}" y="${def.height / 2 - 4}" font-family="sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">${def.label}</text>
            <text x="${def.width / 2}" y="${def.height / 2 + 26}" font-family="sans-serif" font-size="16" fill="rgba(255,255,255,0.7)" text-anchor="middle">${def.width}×${def.height}</text>
        </svg>
    `);

    let pipeline = sharp(svgBuf);

    if (def.filename.endsWith(".png")) {
        // Keep alpha channel for the PNG transparency test
        pipeline = pipeline.png();
    } else {
        pipeline = pipeline.jpeg({ quality: 90 });
    }

    await pipeline.toFile(destPath);
}

export async function POST() {
    if (!isDev) {
        return NextResponse.json({ error: "Only available in development mode" }, { status: 403 });
    }

    const downloadsDir = getDownloadsDir();
    const results: { title: string; status: "seeded" | "skipped" | "error"; error?: string }[] = [];

    for (const img of SEED_IMAGES) {
        const destPath = path.join(downloadsDir, img.filename);
        try {
            // Skip if already in DB
            const existing = await prisma.video.findFirst({ where: { localPath: destPath } });
            if (existing) {
                results.push({ title: img.title, status: "skipped" });
                continue;
            }

            // Generate image on disk
            await generateImage(img, destPath);

            const stat = fs.statSync(destPath);
            await prisma.video.create({
                data: {
                    title: img.title,
                    localPath: destPath,
                    fileSize: stat.size,
                    duration: null,
                    mediaType: "image",
                    sourcePlatform: img.platform,
                },
            });
            results.push({ title: img.title, status: "seeded" });
        } catch (err: any) {
            results.push({ title: img.title, status: "error", error: err.message });
        }
    }

    return NextResponse.json({ success: true, results, testUrls: TEST_URLS });
}

export async function DELETE() {
    if (!isDev) {
        return NextResponse.json({ error: "Only available in development mode" }, { status: 403 });
    }

    const downloadsDir = getDownloadsDir();
    let removed = 0;

    for (const img of SEED_IMAGES) {
        const destPath = path.join(downloadsDir, img.filename);
        try {
            await prisma.video.deleteMany({ where: { localPath: destPath } });
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            removed++;
        } catch { }
    }

    return NextResponse.json({ success: true, removed });
}
