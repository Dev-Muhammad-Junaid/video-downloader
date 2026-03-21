import { prisma } from "./prisma";

export async function ensureDefaultProfile() {
    const defaultProfile = await prisma.downloadProfile.findUnique({
        where: { name: "Default Profile" }
    });

    if (!defaultProfile) {
        await prisma.downloadProfile.create({
            data: {
                name: "Default Profile",
                sitePattern: "*",
                maxResolution: "best",
                preferredFormat: "mp4",
                isActive: true,
                priority: -1, // Lowest priority
            }
        });
    }
}

export async function getMatchingProfile(url: string) {
    const profiles = await prisma.downloadProfile.findMany({
        where: { isActive: true },
        orderBy: { priority: "desc" }
    });

    for (const profile of profiles) {
        if (!profile.sitePattern || profile.sitePattern === "*") continue;
        
        // Simple string contains or regex
        try {
            const regex = new RegExp(profile.sitePattern.replace(/\*/g, '.*'), 'i');
            if (regex.test(url)) return profile;
        } catch {
            if (url.includes(profile.sitePattern)) return profile;
        }
    }

    // Default to "*" or the one with priority -1
    return profiles.find(p => p.sitePattern === "*" || p.priority === -1);
}

export function getResolutionConstraint(res: string | null) {
    if (!res || res === "best") return "";
    
    // Convert e.g. "1080p" to "1080"
    const height = res.replace(/[^0-9]/g, '');
    if (!height) return "";
    
    return `[height<=${height}]`;
}

export function getYtDlpFormat(profile: { maxResolution: string | null, preferredFormat: string | null }, formatId?: string) {
    if (formatId === "audio") {
        return { args: ["-x", "--audio-format", "mp3"], isAudio: true };
    }
    
    // If formatId is a specific numeric ID from the platform, use it
    if (formatId && !["audio", "best"].includes(formatId)) {
        // Many platforms provide a single ID that includes both, 
        // but for YouTube we usually need to append +bestaudio
        return { 
            args: ["-f", `${formatId}+bestaudio/best`, "--merge-output-format", "mp4"], 
            isAudio: false 
        };
    }

    const resConstraint = getResolutionConstraint(profile.maxResolution);
    const format = profile.preferredFormat === "mp3" ? "mp3" : (profile.preferredFormat || "mp4");
    
    if (format === "mp3") {
        return { args: ["-x", "--audio-format", "mp3"], isAudio: true };
    }

    // Example: bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best
    const ext = format === "best" ? "" : `[ext=${format}]`;
    const formatString = `bestvideo${resConstraint}${ext}+bestaudio/best${resConstraint}${ext}/best`;
    
    return { 
        args: ["-f", formatString, "--merge-output-format", format === "best" ? "mp4" : format], 
        isAudio: false 
    };
}
