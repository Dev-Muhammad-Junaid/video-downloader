#!/usr/bin/env node
/**
 * Feature-level smoke suite.
 *
 * Drives the real HTTP API of a running SnapDown against real binaries and
 * real files — no mocks — so it exercises the same paths a user does:
 * download, library, thumbnails, image edit, video trim/crop export, audio
 * export, subtitle burn-in, bulk actions, history and cloud sync.
 *
 * Intended before a build that changes behaviour. It is deliberately NOT part
 * of `vitest`, which covers pure logic and must stay fast and offline.
 *
 *   npm run test:smoke                  # against http://localhost:3000
 *   BASE_URL=http://localhost:3005 npm run test:smoke
 *   SMOKE_KEEP=1 npm run test:smoke     # leave created items behind
 *
 * Anything it creates is tagged and removed at the end unless SMOKE_KEEP is
 * set. Steps whose prerequisites are absent (no API key, no cloud credentials)
 * report SKIP rather than failing, so a partial environment still gives a
 * useful result.
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const KEEP = process.env.SMOKE_KEEP === "1";

// A small direct-MP4 URL. Deliberately a plain media file rather than a
// platform page: the generic extractor reports unknown height for these, which
// is precisely the case that used to fail format selection under a
// resolution-capped profile. Override with SMOKE_VIDEO_URL.
const TEST_VIDEO = process.env.SMOKE_VIDEO_URL
    || "https://filesamples.com/samples/video/mp4/sample_960x400_ocean_with_audio.mp4";

/**
 * A minimal but genuinely valid ASS file, used to exercise the burn-in path.
 * One styled dialogue line is enough for ffmpeg's subtitles filter to have to
 * parse the header, resolve the style, and composite a frame.
 */
const MINIMAL_ASS = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 384",
    "PlayResY: 288",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Arial,24,&H00FFFFFF,&H00000000,&H80000000,0,0,1,2,0,2,10,10,20,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,SnapDown smoke test caption",
].join("\n");

const results = [];
let createdIds = [];

const c = { reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", dim: "\x1b[2m" };

async function api(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { ok: res.ok, status: res.status, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until `check` returns truthy, or give up. */
async function waitFor(label, check, { timeout = 180_000, interval = 2000 } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
        last = await check();
        if (last) return last;
        await sleep(interval);
    }
    throw new Error(`timed out after ${Math.round(timeout / 1000)}s waiting for ${label}`);
}

async function step(name, fn) {
    const started = Date.now();
    try {
        const detail = await fn();
        if (detail && detail.skipped) {
            results.push({ name, state: "SKIP", detail: detail.reason });
            console.log(`${c.yellow}SKIP${c.reset}  ${name} ${c.dim}— ${detail.reason}${c.reset}`);
            return;
        }
        const ms = Date.now() - started;
        results.push({ name, state: "PASS", detail });
        console.log(`${c.green}PASS${c.reset}  ${name} ${c.dim}${ms}ms${detail ? ` — ${detail}` : ""}${c.reset}`);
    } catch (err) {
        results.push({ name, state: "FAIL", detail: err.message });
        console.log(`${c.red}FAIL${c.reset}  ${name}\n      ${c.red}${err.message}${c.reset}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

/** Waits for an export/edit job to leave the running states. */
async function waitForJob(jobId, label) {
    return waitFor(label, async () => {
        const { body } = await api("/api/download/queue");
        const job = Array.isArray(body) ? body.find((j) => j.id === jobId) : null;
        if (!job) return null;
        if (["completed", "error", "cancelled"].includes(job.status)) return job;
        return null;
    });
}

async function main() {
    console.log(`\nSnapDown smoke suite → ${BASE}\n`);

    // ── Reachability and dependencies ───────────────────────────────────────
    await step("app is serving", async () => {
        const res = await fetch(BASE);
        assert(res.ok, `GET / returned ${res.status}`);
    });

    let preflight;
    await step("preflight reports its dependencies", async () => {
        const { ok, body } = await api("/api/settings/preflight", { method: "POST" });
        assert(ok, "preflight request failed");
        preflight = body;
        const missing = Object.values(body.binaries)
            .filter((b) => !b.available)
            .map((b) => `${b.name}${b.required ? " (required)" : ""}`);
        assert(body.binaries.ytdlp.available, "yt-dlp unavailable — downloads cannot work");
        assert(body.binaries.ffmpeg.available, "ffmpeg unavailable — no edit or export can work");
        assert(body.binaries.ffprobe.available, "ffprobe unavailable — durations will be missing");
        return missing.length ? `optional missing: ${missing.join(", ")}` : "all binaries present";
    });

    // ── Download ────────────────────────────────────────────────────────────
    // A fixture that has gone offline must not look like a broken app, so the
    // download-dependent steps degrade to SKIP rather than failing.
    let fixtureReachable = false;
    await step("test video fixture is reachable", async () => {
        try {
            const res = await fetch(TEST_VIDEO, { method: "GET", headers: { Range: "bytes=0-1023" } });
            fixtureReachable = res.ok || res.status === 206;
            if (!fixtureReachable) return { skipped: true, reason: `fixture returned ${res.status} — set SMOKE_VIDEO_URL` };
            return TEST_VIDEO.replace(/^https?:\/\//, "").slice(0, 48);
        } catch (err) {
            return { skipped: true, reason: `fixture unreachable (${err.message}) — set SMOKE_VIDEO_URL` };
        }
    });

    let video;
    await step("queues and completes a download", async () => {
        if (!fixtureReachable) return { skipped: true, reason: "no reachable test video" };
        const { ok, body } = await api("/api/download/queue", {
            method: "POST",
            body: JSON.stringify({ urls: [TEST_VIDEO] }),
        });
        assert(ok, `queue rejected the URL: ${JSON.stringify(body)}`);
        assert(body.queued >= 1, "nothing was queued");

        const job = await waitFor("the download to finish", async () => {
            const { body: q } = await api("/api/download/queue");
            const j = Array.isArray(q) ? q.find((x) => x.url === TEST_VIDEO) : null;
            if (!j) return null;
            return ["completed", "error", "cancelled"].includes(j.status) ? j : null;
        });
        assert(job.status === "completed", `download ended as "${job.status}": ${job.error || ""}`);
        return `${job.title}`;
    });

    await step("the download lands in the library with real metadata", async () => {
        if (!fixtureReachable) return { skipped: true, reason: "no reachable test video" };
        const { body } = await api("/api/library");
        const items = Array.isArray(body) ? body : body.videos || [];
        video = items.find((v) => v.originalUrl === TEST_VIDEO) || items[0];
        assert(video, "no library entry for the downloaded video");
        createdIds.push(video.id);
        assert(video.fileSize > 0, "library entry has no file size");
        // Duration comes from ffprobe — this is the check that would have
        // caught ffprobe being unresolvable.
        assert(video.duration && video.duration > 0, "no duration — is ffprobe resolving?");
        return `${video.title} · ${Math.round(video.duration)}s`;
    });

    await step("serves a generated thumbnail", async () => {
        if (!video) return { skipped: true, reason: "no downloaded video to thumbnail" };
        const res = await fetch(`${BASE}/api/thumbnail/${video.id}`);
        assert(res.ok, `thumbnail returned ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        assert(buf.length > 512, `thumbnail suspiciously small (${buf.length} bytes)`);
        return `${(buf.length / 1024).toFixed(0)} KB`;
    });

    // ── Multiple concurrent downloads ───────────────────────────────────────
    await step("handles several downloads queued at once", async () => {
        if (!fixtureReachable) return { skipped: true, reason: "no reachable test video" };
        // Distinct query strings so they're separate queue entries rather than
        // being collapsed as duplicates of one another.
        const urls = [`${TEST_VIDEO}?smoke=1`, `${TEST_VIDEO}?smoke=2`];
        const { ok, body } = await api("/api/download/queue", {
            method: "POST",
            body: JSON.stringify({ urls }),
        });
        assert(ok, `bulk queue failed: ${JSON.stringify(body)}`);
        assert(body.queued === urls.length, `queued ${body.queued} of ${urls.length}`);

        const done = await waitFor("both downloads to settle", async () => {
            const { body: q } = await api("/api/download/queue");
            const mine = (Array.isArray(q) ? q : []).filter((j) => urls.includes(j.url));
            const settled = mine.filter((j) => ["completed", "error", "cancelled"].includes(j.status));
            return settled.length === urls.length ? settled : null;
        });
        const failed = done.filter((j) => j.status !== "completed");
        assert(failed.length === 0, `${failed.length} of ${urls.length} failed: ${failed[0]?.error}`);

        const { body: lib } = await api("/api/library");
        const items = Array.isArray(lib) ? lib : lib.videos || [];
        for (const u of urls) {
            const v = items.find((x) => x.originalUrl === u);
            if (v) createdIds.push(v.id);
        }
        return `${done.length} completed`;
    });

    // ── Search and filtering ────────────────────────────────────────────────
    await step("finds the item through search", async () => {
        if (!video) return { skipped: true, reason: "no library item to act on" };
        const term = encodeURIComponent(String(video.title).split(" ")[0]);
        const { ok, body } = await api(`/api/search?q=${term}`);
        assert(ok, "search request failed");
        const hits = Array.isArray(body) ? body : body.results || body.videos || [];
        assert(hits.length > 0, "search returned nothing for a title we know exists");
        return `${hits.length} hit(s)`;
    });

    // ── Labels ──────────────────────────────────────────────────────────────
    let labelId;
    await step("creates a label and attaches it", async () => {
        if (!video) return { skipped: true, reason: "no library item to act on" };
        const name = `smoke-${Date.now()}`;
        const { ok, body } = await api("/api/labels", { method: "POST", body: JSON.stringify({ name }) });
        assert(ok, `label creation failed: ${JSON.stringify(body)}`);
        labelId = body.id || body.label?.id;
        assert(labelId, "no label id returned");

        const attach = await api(`/api/library/${video.id}/labels`, {
            method: "POST",
            body: JSON.stringify({ labelId }),
        });
        assert(attach.ok, `attaching the label failed: ${JSON.stringify(attach.body)}`);
        return name;
    });

    // ── Image editing ───────────────────────────────────────────────────────
    await step("edits an image", async () => {
        const seed = await api("/api/dev/seed", { method: "POST" });
        if (!seed.ok) return { skipped: true, reason: "dev seed endpoint unavailable (production build?)" };

        const { body: lib } = await api("/api/library");
        const items = Array.isArray(lib) ? lib : lib.videos || [];
        const image = items.find((v) => v.mediaType === "image");
        if (!image) return { skipped: true, reason: "no image in the library to edit" };

        const { ok, body } = await api("/api/library/edit", {
            method: "POST",
            body: JSON.stringify({
                videoId: image.id,
                action: "image-edit",
                params: { rotation: 90, brightness: 1.1, format: "jpeg", quality: 90 },
            }),
        });
        assert(ok, `image edit failed: ${JSON.stringify(body)}`);
        assert(body.video, "image edit returned no resulting video record");
        return "rotate + brightness applied";
    });

    // ── Video export: trim, and trim+crop ───────────────────────────────────
    await step("exports a trimmed video", async () => {
        if (!video) return { skipped: true, reason: "no library item to act on" };
        const { ok, body } = await api("/api/library/edit", {
            method: "POST",
            body: JSON.stringify({
                videoId: video.id,
                action: "trim",
                params: { startTime: 0, endTime: 2 },
            }),
        });
        assert(ok, `trim export was rejected: ${JSON.stringify(body)}`);
        const job = await waitForJob(body.jobId, "the trim export");
        assert(job.status === "completed", `trim ended as "${job.status}": ${job.error || ""}`);
        return "2s clip rendered";
    });

    await step("exports a trimmed and cropped video", async () => {
        if (!video) return { skipped: true, reason: "no library item to act on" };
        const { ok, body } = await api("/api/library/edit", {
            method: "POST",
            body: JSON.stringify({
                videoId: video.id,
                action: "trim-crop",
                params: { startTime: 0, endTime: 2, x: 0, y: 0, w: 160, h: 90 },
            }),
        });
        assert(ok, `trim-crop export was rejected: ${JSON.stringify(body)}`);
        const job = await waitForJob(body.jobId, "the trim-crop export");
        assert(job.status === "completed", `trim-crop ended as "${job.status}": ${job.error || ""}`);
        return "160x90 crop rendered";
    });

    await step("rejects an export with missing parameters", async () => {
        if (!video) return { skipped: true, reason: "no library item to act on" };
        // The validator is the only thing standing between a malformed request
        // and a confusing ffmpeg failure much later.
        const { ok, status } = await api("/api/library/edit", {
            method: "POST",
            body: JSON.stringify({ videoId: video.id, action: "trim", params: {} }),
        });
        assert(!ok, "a trim with no start/end time was accepted");
        return `rejected with ${status}`;
    });

    // ── Audio export ────────────────────────────────────────────────────────
    await step("exports trimmed audio", async () => {
        if (!video) return { skipped: true, reason: "no library item to act on" };
        const { ok, body } = await api("/api/library/edit", {
            method: "POST",
            body: JSON.stringify({
                videoId: video.id,
                action: "trim-audio",
                params: { startTime: 0, endTime: 2, format: "mp3" },
            }),
        });
        assert(ok, `audio export was rejected: ${JSON.stringify(body)}`);
        const job = await waitForJob(body.jobId, "the audio export");
        assert(job.status === "completed", `audio export ended as "${job.status}": ${job.error || ""}`);
        return "mp3 rendered";
    });

    // ── Transcription and subtitles ─────────────────────────────────────────
    await step("transcribes and burns in subtitles", async () => {
        if (!video) return { skipped: true, reason: "no library item to transcribe" };
        const groq = preflight?.providers?.groq;
        const openai = preflight?.providers?.openai;
        const haveProvider = (groq?.configured && groq?.reachable) || (openai?.configured && openai?.reachable);
        if (!haveProvider) return { skipped: true, reason: "no reachable transcription provider configured" };
        // A silent clip has nothing to transcribe, and failing here would say
        // the app is broken when it's really the fixture. Point
        // SMOKE_VIDEO_URL at something with an audio track to cover this.
        if (video.mediaType === "video" && !video.hasAudio && video.hasAudio !== undefined) {
            return { skipped: true, reason: "test clip has no audio track" };
        }

        const t = await api(`/api/transcription/${video.id}`, { method: "POST" });
        assert(t.ok, `transcription request failed: ${JSON.stringify(t.body)}`);

        await waitFor("the transcript", async () => {
            const { body } = await api("/api/library");
            const items = Array.isArray(body) ? body : body.videos || [];
            const v = items.find((x) => x.id === video.id);
            if (v?.transcriptStatus === "error") {
                throw new Error(v.transcriptError || "transcription failed (does the clip have an audio track?)");
            }
            return v?.transcriptStatus === "completed" ? v : null;
        }, { timeout: 240_000 });

        const vtt = await fetch(`${BASE}/api/transcription/${video.id}/vtt`);
        assert(vtt.ok, `VTT fetch returned ${vtt.status}`);
        const text = await vtt.text();
        assert(text.includes("-->"), "VTT has no cue timings");

        // The editor builds the ASS client-side and posts the rendered text, so
        // the API takes assContent rather than a style config. Feeding it a real
        // subtitle file means ffmpeg genuinely has to parse and burn it in.
        const burn = await api("/api/library/edit", {
            method: "POST",
            body: JSON.stringify({
                videoId: video.id,
                action: "trim-burn",
                params: { startTime: 0, endTime: 2, assContent: MINIMAL_ASS },
            }),
        });
        assert(burn.ok, `subtitle burn was rejected: ${JSON.stringify(burn.body)}`);
        const job = await waitForJob(burn.body.jobId, "the subtitle burn-in");
        assert(job.status === "completed", `burn-in ended as "${job.status}": ${job.error || ""}`);
        return "transcript + burned-in captions";
    });

    // ── History / logs ──────────────────────────────────────────────────────
    await step("records activity in history", async () => {
        const { ok, body } = await api("/api/history");
        assert(ok, "history request failed");
        const logs = Array.isArray(body) ? body : body.logs || [];
        assert(logs.length > 0, "history is empty after a download and several exports");
        return `${logs.length} entries`;
    });

    // ── Cloud sync ──────────────────────────────────────────────────────────
    await step("uploads to cloud storage", async () => {
        if (!video) return { skipped: true, reason: "no library item to upload" };
        const r2 = preflight?.providers?.r2;
        if (!r2?.configured || !r2?.reachable) {
            return { skipped: true, reason: "no reachable S3/R2 bucket configured" };
        }
        const { ok, body } = await api("/api/sync/bulk", {
            method: "POST",
            body: JSON.stringify({ ids: [video.id] }),
        });
        assert(ok, `cloud upload failed: ${JSON.stringify(body)}`);
        return `${body.uploaded ?? 0} uploaded`;
    });

    // ── Export / backup of the library itself ───────────────────────────────
    await step("produces a library export", async () => {
        const res = await fetch(`${BASE}/api/export`);
        assert(res.ok, `export returned ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        assert(buf.length > 0, "export was empty");
        return `${(buf.length / 1024).toFixed(0)} KB`;
    });

    // ── Bulk actions ────────────────────────────────────────────────────────
    await step("applies a bulk label", async () => {
        if (!labelId) return { skipped: true, reason: "no label was created earlier" };
        const { ok, body } = await api("/api/library/bulk", {
            method: "POST",
            body: JSON.stringify({ ids: createdIds, action: "attachLabel", labelId }),
        });
        assert(ok, `bulk label failed: ${JSON.stringify(body)}`);
        return `${body.updated ?? 0} updated`;
    });

    // ── Update checker ──────────────────────────────────────────────────────
    await step("checks for updates", async () => {
        const { ok, body } = await api("/api/check-update");
        assert(ok, "update check failed");
        assert(body.currentVersion, "no current version reported");
        return `running ${body.currentVersion}, latest ${body.latestVersion ?? "unknown"}`;
    });

    // ── Cleanup ─────────────────────────────────────────────────────────────
    if (KEEP) {
        console.log(`\n${c.dim}SMOKE_KEEP=1 — leaving ${createdIds.length} created items in place.${c.reset}`);
    } else {
        await step("cleans up everything it created", async () => {
            await api("/api/download/queue?mode=all", { method: "DELETE" });
            if (createdIds.length) {
                await api("/api/library/bulk", {
                    method: "DELETE",
                    body: JSON.stringify({ ids: createdIds }),
                });
            }
            if (labelId) await api(`/api/labels/${labelId}`, { method: "DELETE" });
            await api("/api/dev/seed", { method: "DELETE" }).catch(() => {});
            return `${createdIds.length} items removed`;
        });
    }

    // ── Report ──────────────────────────────────────────────────────────────
    const pass = results.filter((r) => r.state === "PASS").length;
    const fail = results.filter((r) => r.state === "FAIL");
    const skip = results.filter((r) => r.state === "SKIP").length;

    console.log(`\n${"─".repeat(58)}`);
    console.log(`${pass} passed · ${fail.length} failed · ${skip} skipped`);
    if (fail.length) {
        console.log(`\n${c.red}Failures:${c.reset}`);
        for (const f of fail) console.log(`  · ${f.name}\n    ${f.detail}`);
    }
    console.log("");
    process.exit(fail.length ? 1 : 0);
}

main().catch((err) => {
    console.error(`\n${c.red}Smoke suite crashed:${c.reset} ${err.stack || err.message}`);
    process.exit(1);
});
