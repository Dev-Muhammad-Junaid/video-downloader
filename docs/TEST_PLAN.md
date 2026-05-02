# SnapDown — Feature Test Plan

A reference matrix of sample links covering every supported scenario. Copy a link, paste it into the queue, and verify the expected behaviour. These URLs are all public / Creative-Commons where possible, so they're safe to re-test indefinitely.

> **Before you start:** Make sure you have 5 presets seeded (Settings → Quality & Format Profiles → *Reset to Defaults*):
>
> - Best Quality · Balanced 1080p · Data Saver 720p · Lowest Quality 480p · Audio Only (MP3)

---

## 1. Video — single item

### 1.1 YouTube (multi-resolution, all profiles should work)


| Link                                                                                        | Expected                                                                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `https://www.youtube.com/watch?v=jNQXAC9IVRw` (Me at the zoo — 18s, 240p only)              | **Best**: downloads 240p. **1080p/720p/480p**: downloads 240p (no ceiling violation). **Audio Only**: extracts MP3. |
| `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (Rick Astley — has 1080p/720p/480p/360p/240p) | **Best**: 1080p auto. **1080p**: 1080p auto. **720p**: 720p auto. **480p**: 480p auto. **Audio Only**: MP3 auto.    |
| `https://www.youtube.com/watch?v=aqz-KE-bpKQ` (Big Buck Bunny — has up to 4K)               | **Best**: 2160p/4K. **1080p**: 1080p. Confirms the resolution ceiling works correctly.                              |


**What to verify:**

- After paste, the item parses and **auto-starts** without a manual click.
- No amber "needs review" banner appears for any of these.
- The profile badge (e.g. "1080p") matches the preset you chose.

### 1.2 Short clips (Shorts, Reels, TikTok)


| Link                                                                               | Expected                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| `https://www.tiktok.com/@tiktok/video/7106594312292453675` (TikTok official short) | Auto-downloads MP4. Audio Only → MP3.           |
| `https://www.youtube.com/shorts/tPEE9ZwTmy0` (YouTube Shorts)                      | Treated as a regular video. All profiles match. |


### 1.3 Vertical / unusual resolutions

- `https://www.youtube.com/watch?v=yI-VJ4ZDwNg` (vertical 1080×1920)

**Verify:** the **Data Saver 720p** profile should still work here — 1080 > 720 so it re-encodes down, *or* if only 1080 is available the matcher correctly flags a review prompt.

---

## 2. Video — auto-start mismatch scenario

Pick a link where the max available resolution is lower than your profile's ceiling and use the **Balanced 1080p** preset on a source that only has lower quality. Or, use one of these known-low-res sources:


| Link                                          | Profile          | Expected                   |
| --------------------------------------------- | ---------------- | -------------------------- |
| `https://www.youtube.com/watch?v=jNQXAC9IVRw` | **Best Quality** | Auto-starts at 240p.       |
| `https://www.youtube.com/watch?v=jNQXAC9IVRw` | **Audio Only**   | Auto-starts, extracts MP3. |


**Manual-fallback scenario (intentional):** You can simulate this by creating a custom profile that demands `resolution = 4K` + `format = mkv` and pointing it at the `jNQXAC9IVRw` link. You should see:

- Amber `AlertCircle` banner: *"…wants ≤2160p but the highest available is 240p — pick a format manually"*.
- Format dropdown on the right with an amber ring.
- Download button does nothing until a format is chosen.

---

## 3. Audio-only sources


| Link                                                          | Expected                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `https://soundcloud.com/forss/flickermood` (SoundCloud track) | Any profile → downloads as audio. Audio Only profile → MP3. |
| `https://music.youtube.com/watch?v=kJQP7kiw5Fk` (YT Music)    | yt-dlp treats as audio+video; Audio Only extracts MP3.      |


**Verify:** `mediaType` in the DB row is `"audio"`, the saved-media card shows the `<Music>` icon, and the Audio filter in the library includes it.

---

## 4. Image-only posts (gallery-dl path)


| Link                                                                                                             | Expected                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `https://twitter.com/NASA/status/1443213748083388419` (Tweet with a single image)                                | Falls back to gallery-dl → `mediaType: "image"` → saves JPEG. |
| `https://www.reddit.com/r/EarthPorn/comments/1acv2bz/` (Reddit image post — replace with any current image post) | Same flow, gallery-dl picks the direct image.                 |
| A direct `.jpg`/`.png`/`.webp` URL (e.g. `https://picsum.photos/seed/snapdown/1200/800.jpg`)                     | Downloaded via `downloadFile`, saved as image.                |


**Audio Only profile on an image:** Expected amber review banner: *"…'Audio Only' is audio-only but this link is an image"*.

**Verify:**

- Image filter in the library shows it.
- The "Convert to MP4" / "Trim Audio" actions are hidden in the player modal.

---

## 5. Playlists (multi-item expansion)


| Link                                                                                               | Expected                                                               |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `https://www.youtube.com/playlist?list=PLBsP89CPrMeN1rB3r_CZqLv3fcmSeTGcz` (short public playlist) | Parsed into individual items, each auto-starts if the profile matches. |
| `https://soundcloud.com/forss/sets/flickerbox-vol-1` (SoundCloud set)                              | Same — items fan out.                                                  |


**Verify:**

- A toast appears: *"📋 Playlist detected: …"*.
- The original "parent" parsing item is removed and N child items appear.
- Each child item follows the auto-download rules independently.

---

## 6. Duplicate handling

Paste **the same link twice** in one `Add to Queue` action, or paste a link you've already downloaded before.

**Expected:**

- Toast: *"Skipped N duplicate links…"* (client-side de-dup).
- If the URL already exists in the library, the download-manager will short-circuit with `"Skipped — URL already in library"` and the existing library item gets a **Duplicate** label (red pill).

---

## 7. Format / container selection


| Profile                | Source         | Expected file                                               |
| ---------------------- | -------------- | ----------------------------------------------------------- |
| Best Quality (mp4)     | YT 1080p video | `.mp4` merged from bestvideo+bestaudio                      |
| Audio Only (mp3)       | YT video       | `.mp3`                                                      |
| Custom profile: `webm` | YT video       | `.webm` if available; otherwise remux to mp4 (our fallback) |
| Custom profile: `mkv`  | YT video       | `.mkv`                                                      |


**Verify the remux fallback:** create a custom profile with `format = webm` and point it at a source that only has mp4. Expected → it should *still* download (via the second-pass resolution match) and save as mp4, not hang or error.

---

## 8. Bulk queue actions

After pasting 3-4 links of mixed types (video + audio + image):


| Action                             | Expected                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Download All** (icon, top-right) | Every `pending` item starts.                                                                             |
| **Pause All**                      | All `downloading` flip to `paused`; progress freezes.                                                    |
| **Resume All**                     | Paused items resume from where they left off.                                                            |
| **Cancel All**                     | All active → `cancelled`; history entries show "Cancelled by user".                                      |
| **Retry Failed**                   | Items with `error` / `cancelled` status re-enter the queue.                                              |
| **Clear Queue**                    | Queue empties; **check `/history` — every in-flight log should now read `cancelled — "Queue cleared"`**. |


---

## 9. Completed-item click-to-open

Once a video finishes, click anywhere on the queue row (title or thumbnail).

**Expected:**

- The Media Player modal opens at the correct index.
- Hover shows a dark overlay + play icon on the thumb.
- Keyboard: Tab to the row, press Enter or Space → same result.

---

## 10. Library — bulk select

Select 2-3 items with the "Select" toggle, then try:


| Action           | Expected                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| **Delete (N)**   | Confirmation dialog; on confirm, rows & files removed.                                                      |
| **Cloud Upload** | If R2 credentials set → uploads all; toast reports count + any errors. No creds → error toast with details. |


**Verify in `/history`:** each successful upload creates a `type: "cloud-upload"` log row with status `completed`, filesize, duration, and key.

---

## 11. Cloud sync — sanity checks

Prerequisite: set up R2 credentials in Settings.


| Test                                        | Expected                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Upload a single video from the player modal | Log row created, `cloudKey` + `cloudUrl` populated, video card shows cloud icon. |
| Bulk upload with 1 already-uploaded + 2 new | Response includes `uploaded: 2, skipped: 1`.                                     |
| Bulk upload with wrong bucket name          | Error row in log with full SDK error details in `output`.                        |


---

## 12. Transcription (Whisper)

Prerequisite: set OpenAI or Groq key in Settings.


| Test                               | Expected                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Transcribe a 30-second video       | Status: `processing` → `completed`. Library shows "Transcribed" badge.          |
| Deep Search on a transcribed video | Query in search bar, toggle AI chip → transcript snippets show in the hit list. |
| Bulk transcribe 3 videos           | `/api/transcription/bulk` returns queued count, each processed serially.        |


---

## 13. Video editor

After downloading a 10-30s video:


| Action                                    | Expected                                                              |
| ----------------------------------------- | --------------------------------------------------------------------- |
| Trim with subtitles toggle ON             | Output file's burned subtitles stay in-sync with the new trim window. |
| Crop to 9:16 aspect                       | Preview overlay accurate; output matches crop.                        |
| Combined trim + crop + burn subtitles     | Single-pass FFmpeg, all three applied.                                |
| Convert to MP4 button (on non-mp4 source) | Output is a new MP4 side-by-side with the original.                   |
| Trim Audio on an MP3                      | New MP3 saved with the selected range.                                |


---

## 14. Edge cases / "should fail cleanly"


| Input                                                  | Expected behaviour                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| A 404 URL                                              | Parse step fails → `error` state with the extractor's error message. |
| A private/age-gated YT video (no cookies configured)   | Log row created with `error` status and yt-dlp's auth error.         |
| A cancelled parse (click Cancel before parse finishes) | Item removed from queue; no orphaned log.                            |
| Kill the server mid-download and restart               | `resumeInterruptedJobs` re-queues the job on boot.                   |


---

## How to report / expand this matrix

- ✅ tick the test off mentally (or add a column) and move on
- ❌ jot the scenario, the URL, and the actual vs expected behaviour
- Add new rows as you find interesting edge-cases (e.g. DRM-protected Vimeo, private Instagram reel, geo-blocked content)

If a test needs a fresh URL (e.g. trending TikToks expire quickly), swap in any current equivalent — the behaviour being tested doesn't depend on the specific content.