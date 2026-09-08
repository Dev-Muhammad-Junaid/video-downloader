<div align="center">

<img src="src/app/icon.png" width="88" alt="SnapDown icon" />

# SnapDown

**A local-first media studio for macOS** — download, organize, edit, transcribe, and cloud-back-up video, image, and audio from social platforms.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](#download)

[Download for macOS](#download) · [Features](#features) · [Development](#development) · [Contributing](#contributing)

</div>

<br/>

<!--
  Screenshots go here. Recommended: Library + Active Queue, Settings, and one
  editor (video trim/crop/subtitles). Drop PNGs into docs/screenshots/ and
  reference them below, e.g.:
  ![Library](docs/screenshots/library.png)
-->
> 📸 *Screenshots coming soon — see [`docs/screenshots/`](docs/screenshots/).*

## What is SnapDown?

SnapDown downloads media from YouTube, X/Twitter, Instagram, TikTok, Reddit, and more, then gives you a real workspace around it: a searchable library, per-item editors, AI transcription, and optional Cloudflare R2 backup — all running locally on your own Mac. There's no login, no cloud dependency for the app itself, and no ads. Your files live on your disk; your database is a local SQLite file.

It ships two ways:
- **A native macOS app** (`.dmg`) — the recommended way to run it day to day.
- **The Next.js source**, if you'd rather run it in a browser tab or contribute.

## Features

- **Download almost anything** — paste one link, several, or a whole playlist. Quality/format **profiles** matched by site pattern pick the right resolution and container automatically, or flag a link for manual choice.
- **A real library** — search (including AI-powered transcript search), filter by platform/type, group by date, labels, bulk actions.
- **Built-in editors** — trim & crop video with aspect-ratio presets, burn in AI-generated subtitles with a live style preview that matches the export 1:1, edit images, and process audio (trim/gain/normalize/fade).
- **AI transcription** — OpenAI or Groq Whisper, powering both the subtitle editor and full-text library search.
- **Cloud backup** — push items to Cloudflare R2 (or any S3-compatible bucket), individually, in bulk, or automatically by label.
- **A real background queue** — downloads and exports run as trackable jobs with live progress, pause/resume/cancel, and retry.
- **Browser integrations** — a drag-to-bookmark bookmarklet and a Chrome/Edge extension to send links straight from the page you're on.

## Download

Grab the latest `.dmg` from **[Releases](../../releases)**, open it, and drag SnapDown into Applications.

The app is unsigned (no Apple Developer certificate), so macOS Gatekeeper will warn on first launch — **right-click the app → Open** once to get past it. After that it opens normally.

### Requirements

SnapDown shells out to a couple of well-known open-source tools for the actual media work. Install these once via [Homebrew](https://brew.sh):

```bash
brew install yt-dlp ffmpeg
```

`ffmpeg` is also bundled, but a system install is used first if present. For downloading images from platforms like Instagram/Reddit, [`gallery-dl`](https://github.com/mikf/gallery-dl) is used if installed (`pipx install gallery-dl`) — optional, video downloads work without it.

If a site (YouTube, in particular) starts blocking downloads or capping quality at 360p, open **Settings → Downloader Cookies** and point it at a browser you're logged into.

## Development

Requires **Node 22** (`better-sqlite3`'s native binary is built against it — see `.nvmrc`).

```bash
git clone https://github.com/Dev-Muhammad-Junaid/video-downloader.git
cd video-downloader
npm install
npm run dev          # runs at http://localhost:3000 in your browser
```

To run it as the desktop app during development (hot-reloads the same way):

```bash
npm run electron:dev
```

To build the actual distributable `.dmg` yourself:

```bash
npm run electron:build   # → dist/SnapDown-<version>-arm64.dmg
```

That command also handles the fiddly parts automatically: rebuilding `better-sqlite3` for Electron's native module ABI, bundling ffmpeg and sharp's native binaries correctly, and reverting your local dev environment back to a plain Node build afterward.

### Tech stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · Prisma + SQLite (via `better-sqlite3`) · Electron · `yt-dlp` / `ffmpeg` / `gallery-dl` · OpenAI/Groq Whisper · AWS S3 SDK (R2-compatible) · JASSUB (subtitle rendering)

### Project structure

```
src/app/            Next.js routes + API endpoints
src/components/     UI components (library, editors, settings)
src/hooks/          Client-side state (queue, library)
src/lib/            Server logic (downloads, ffmpeg, transcription, cloud)
electron/           Electron main process (desktop app shell)
prisma/             Database schema + migrations
```

## Testing

Two suites, deliberately separate.

**Unit tests** — pure logic, no network, no binaries. Fast enough to run on every change.

```bash
npm test
```

Covers the parts that fail silently rather than loudly: the yt-dlp format
cascade, download-error classification, subtitle timing and ASS colour
conversion, and the size/duration formatters.

**Smoke suite** — the whole feature set against a running app, using real
binaries and real files. Run this before a build that changes behaviour;
it isn't needed for a copy tweak.

```bash
npm run dev            # in one terminal
npm run test:smoke     # in another
```

It downloads a real clip, then walks the features end to end: single and
concurrent downloads, library metadata and thumbnails, search, labels, image
editing, video trim and trim+crop exports, audio export, transcription and
burned-in subtitles, history, cloud sync, library export, and bulk actions.
Everything it creates is removed afterwards (`SMOKE_KEEP=1` to keep it).

Steps whose prerequisites are missing report SKIP rather than failing, so a
machine without cloud credentials or an AI key still gets a useful result.
Point it elsewhere with `BASE_URL`, and change the test clip with
`SMOKE_VIDEO_URL` (it needs an audio track for the transcription step).

## Contributing

Issues, ideas, and pull requests are welcome. A few things that help:

- Run `npx tsc --noEmit` and `npm test` before opening a PR — the codebase is kept typecheck-clean.
- If your change touches downloads, editing or exports, run `npm run test:smoke` too.
- Keep changes scoped; a bug fix doesn't need to also refactor its neighborhood.
- If you're touching the video editor's subtitle system, note that the live preview and the ffmpeg export share one ASS source of truth (`src/lib/ass-builder.ts`) — they're meant to always match exactly.

## License

[MIT](LICENSE) — see the license file for details.

---

<div align="center">
Built by <a href="https://github.com/Dev-Muhammad-Junaid">@Dev-Muhammad-Junaid</a>
</div>
