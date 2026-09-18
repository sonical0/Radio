# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Fallout-themed internet radio web app. No build system, no dependencies to install — serve the folder with any static file server.

Three files matter at runtime: `index.html` (all the CSS, markup and logic), `stations.json` (the built-in stations, fetched at load), and `vendor/hls.light.min.js` (hls.js 1.7.3, Apache-2.0 — see `vendor/hls.js-LICENSE.txt`). hls.js is pinned and served locally rather than from a CDN **on purpose**: the page must render and play identically offline and on an isolated LAN. Don't swap it for a CDN `<script>` — and don't inline it into `index.html` either, it is 377 KB of minified one-liner.

The two webfonts and the favicon stay embedded as `data:` URIs for the same reason. Only the audio streams, the "Now Playing" endpoints and the Radio-Browser directory go out to the network.

## Running Locally

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Running in Docker

See [DOCKER.md](./DOCKER.md) for running the container via CLI (`docker compose up`) and for adding/running it in Docker Desktop's GUI.

## Architecture

Everything lives in `index.html` as three inline sections:

1. **CSS** (`<style>`) — Pip-Boy green-on-black terminal aesthetic using CSS variables (`--green`, `--bg`, etc.). Animations: CRT scanline overlay via `body::before`, screen flicker, visualizer bars, ticker scroll, station pulse.

2. **HTML** — Static structure: header + clock, now-playing panel (station name, song ticker, playback controls, volume), streaming progress bar, visualizer, station list (rendered by JS), add-station form.

3. **JavaScript** (`<script>`) — No frameworks. Key data and logic:
   - **Station shape** — `{ group, name, url, hls, meta, gain, isCustom }`. `normalizeStation()` is the single door into the `stations` array: `stations.json`, `localStorage`, a file import and the directory all go through it, and `serializeStation()` is the single way out. Two legacy field names are still *read* and never written back: `game` (now `group`) and `apiId` (now `meta`), so old exports and old `localStorage` payloads keep working.
   - `group` is a free label (a game, a genre, a country code), not an enum. Grouping is case-insensitive (`groupKey()`); the uppercase look is CSS (`text-transform`), so the spelling the user typed survives in storage and exports. A station without a group lands in `DEFAULT_GROUP`.
   - `STATIONS` — built-in stations, fetched at runtime from `stations.json`.
   - Custom stations — persisted to `localStorage` as `customStations` (schema-validated via `isValidStation()`); merged with `STATIONS` at load via `loadCustomStations()` / `saveCustomStations()`. Each station object carries `isCustom: true/false` — built-in vs custom is tracked by that flag, not by array position.
   - **User edits to built-in stations** — `stations.json` is read-only at runtime and never rewritten. What the user changes on a built-in (gain, hidden) lives beside it in `localStorage.builtinStationPrefs`, keyed by **stream URL**, written by `saveBuiltinPrefs()` and applied at load by `applyBuiltinPrefs()`. Only *deltas* are stored: `saveBuiltinPrefs()` compares against `builtinDefaultGain` (a Map filled from `stations.json` before any pref is applied) and drops a station whose gain is back to the file's value, so a later edit to `stations.json` still reaches a user who never touched that station. Read the prefs through the Map, not the parsed object — the keys come from storage and one could be `__proto__`. `persistStation(idx)` is the single dispatcher: custom → `saveCustomStations()`, built-in → `saveBuiltinPrefs()`.
   - **Hidden stations (`hidden: true`)** — the row's ✕ hides, it does not delete, for built-ins *and* custom stations. A hidden station **stays in the `stations` array**: the trash needs it back, and keeping the slot means indices (`current`, the `st-N` / `stb-N` DOM ids) no longer shift on every removal. Everything that walks the array therefore has to skip it — `buildStationList()`, `refreshNowPlaying()`, `stepStation()` (behind `nextStation()`/`prevStation()`), `restoreLastStation()` and `exportStations()` all do. `hideStation()` stops playback when the hidden station is the current one. Adding a URL that a hidden station already holds **un-hides it** instead of failing as a duplicate the user cannot see (`addToLibrary()`, `importStations()`).
   - `buildTrashSection()` — the `<details class="trash">` at the bottom of the list, rendered only when something is hidden, with a per-station "Restaurer". `trashOpen` survives the re-render that restoring triggers, otherwise the panel would collapse under the cursor. Permanent deletion (`purgeStation()`, the old `deleteStation()`) is offered there for custom stations only — a built-in comes back from `stations.json` at the next load anyway.
   - Per-station gain — `sanitizeGain()` coerces a missing, non-numeric or out-of-range `gain` to 1 (an `NaN` would make `audio.volume = NaN` throw), `stationGain(idx)` reads it, `effectiveVolume()` multiplies it by the master volume. Every station gets an inline slider built by `buildGainControl()`: `applyStationGain()` on `input` (audible immediately when that station is playing), `persistStation()` on `change` only, so a drag is one `localStorage` write. The control stops `click`/`keydown`/`pointerdown` from bubbling, otherwise adjusting it would trigger the row's play handler. A built-in's gain is written to `builtinStationPrefs`, never back into `stations.json`.
   - `current` — index into the `stations` array of the active station (-1 = none).
   - `buildStationList()` — re-renders the full station list DOM (`<section>`/`<ul>`/`<li>`), grouped by `group` (a `Map` keyed by `groupKey()`, not an object literal — the key is user-typed and could be `__proto__`). It also refreshes the `<datalist>` of existing groups offered by the add form. Each `<li>` stays a plain `listitem` (so the `<ul>` keeps its list semantics) and the tune-in action is a real `<button class="station-btn" id="stb-N">` holding the station name, with `aria-pressed` and `aria-describedby` pointing at the now-playing text. Its `::after` stretches the click target over the whole row while keeping the focusable element small; the gain slider and delete button are siblings lifted above it with `z-index`, so they stay clickable and exposed to assistive tech. Do **not** put `role="button"` back on the `<li>`: a button flattens its subtree, which hid both nested controls from screen readers and broke the list semantics.
   - `renderStatus(el, key)` / `setStationStatus(idx, key)` / `setStationPressed(idx, bool)` — the only writers of a row's status text and pressed state (`STATION_STATUS` holds the labels). `renderStatus()` takes the element, `setStationStatus()` resolves it by id — `buildStationList()` must call the former, because it fills each row before attaching it to the document, where `getElementById` still returns null. The leading glyph goes in an `aria-hidden` span so "■ ON AIR" is announced as "ON AIR". The visible status is `aria-hidden` as a whole since `aria-pressed` already carries that state; transient stream states reach screen readers through the `aria-live` `#np-station` instead.
   - **Now Playing** — `refreshNowPlaying()` polls every station carrying a `meta` descriptor; runs on load and every 30 s, skipped while the tab is hidden (Page Visibility) or a previous poll is still in flight. `nowPlayingData` is keyed by stream **URL**, not array index, so adding or deleting a station never shifts entries — read it through `npFor(idx)`. `MAX_META_POLL` caps the batch at 40 (the directory makes long lists easy); the current station is always polled, and `refreshOne(idx)` fetches on demand when a station outside the batch is selected.
   - **Metadata sources** — `meta: { type, url }` with `type` in `azuracast` | `icecast`, parsed by `parseAzuracast()` / `parseIcecast()`. These two are the only families that reliably send a CORS header; Shoutcast v2 (`/stats?json=1`) sends none and is unreachable from a browser. Icecast's `status-json.xsl` is usually switched off in the wild (one of six public servers answered when this was written), so it is offered as manual entry only, never auto-detected.
   - `detectMeta(url)` — an AzuraCast stream URL is always `https://<host>/listen/<shortcode>/<mount>`, and `/api/nowplaying/<shortcode>` accepts the shortcode as well as the numeric id. Pasting such a URL therefore yields now-playing metadata with **no configuration**, which is how most custom stations get their titles. `normalizeMeta()` order of precedence: explicit `meta` → legacy `apiId` → `detectMeta()`.
   - **HLS** — `attachStream(idx)` / `detachStream()` are the only places that touch `audio.src`; `playStation`, `togglePlay`, `handleStreamDrop` and `stopRadio` all route through them. A station flagged `hls: true` goes to hls.js **even when `canPlayType('application/vnd.apple.mpegurl')` says `"maybe"`** — some Chromium engines answer that with only partial support, and hls.js additionally surfaces errors `handleStreamDrop()` can act on. Native playback is the iOS path, where MSE does not exist. `attachStream()` returns `false` when neither is possible, and the caller says so instead of starting a silent stream. Changing station destroys the previous hls.js instance — leaving it attached would make two streams fight over the element.
   - **Directory** — `searchDirectory()` queries Radio-Browser (no API key, permissive CORS) by name, then by `tag` when the name yields nothing, since people type genres. Rows are built as DOM, never `innerHTML`: the directory is open to public writes. `isPlayableStreamUrl()` drops `http://` streams when the page itself is `https:` — mixed content the browser would block, leaving a station that is added but mute.
   - `handleStreamDrop()` — reconnection logic (up to 3 attempts, 2 s apart) before giving up and showing "FLUX INTERROMPU". Triggered immediately on an audio `error`, but only after `STALL_GRACE_MS` on `stalled` — and then only if `currentTime` has not advanced meanwhile, since `stalled` also fires on mere network slowness. A `waiting` event shows "⟳ TAMPON…" without reconnecting.
   - `updateMediaSession()` — feeds the Media Session API so OS media keys, the lock screen and headset buttons work; play/pause/stop/previoustrack/nexttrack handlers are bound once at load.
   - Keyboard shortcuts — a global `keydown` handler (Space, ←/→, ↑/↓, M, S). It ignores events coming from form fields, Space on a focused `<button>` (the browser already activates it), and anything already `defaultPrevented` by the station list's own Enter/Space handling.
   - Sleep timer — `cycleSleepTimer()` steps through `SLEEP_STEPS_MIN` (off / 15 / 30 / 60 / 90 min); `onSleepTick()` fades the volume over the final `SLEEP_FADE_MS` then calls `stopRadio()`. `cancelSleepTimer()` restores the gain-corrected volume so an interrupted fade never leaves the audio quiet.
   - `restoreLastStation()` — re-selects the station stored in `localStorage.lastStationUrl` on load, marked with the `.selected` class (distinct from `.playing`, which pulses). It never autoplays.
   - `resolveStreamUrl()` — resolves M3U/PLS playlists to a direct stream URL (6 s timeout), and flags HLS. The HLS test (`.m3u8`, `#EXT-X-`, a `*mpegurl` MIME type) must stay **before** both the M3U branch and the `audio/`-prefix shortcut: a master playlist also starts with `#EXTM3U` and is served as `audio/x-mpegurl`, so either one would swallow it and keep a single segment as the stream URL. Playlist entries are resolved against the playlist URL (relative paths work) and re-checked with `isPrivateHost()` + a protocol check, so a remote playlist cannot redirect the player at a local service; a rejected entry comes back as `{ blocked: true }`. `isPrivateHost()` also gates the URL the user types (best-effort SSRF guard).
   - `exportStations()` / `importStations()` — download/upload custom stations as JSON, with schema + host validation on import.
   - Visualizer — 34 `div.vis-bar` elements driven by a `setInterval` with random heights when playing; `startVis()` / `stopVis()`. Heights are decorative, not real FFT data (see "Adding a Built-in Station" for why Web Audio is off-limits here). Paused while the tab is hidden.

## Screen Colour

Four palettes ship: green (the default), amber, blue and white. They are plain `:root[data-theme="…"]` blocks redefining the variables the whole sheet already uses, so nothing else in the CSS knows a theme exists. The variables keep their `--green-*` names in every palette — renaming them would touch the entire sheet and a variable's name is not what anyone sees.

`--accent-rgb` carries the main hue as components. Six `rgba()` were hardcoded (title glow, header shadow, hovered and playing row backgrounds) and a hex variable cannot serve those; without it they would have stayed green on an amber screen. If you add a translucent accent anywhere, use `rgba(var(--accent-rgb), …)` or it will not follow the theme.

The choice is stored in `localStorage.themePalette` — the same key the React Native app uses — and applied by a short script in `<head>`, not by the main script at the end of the body: otherwise the page paints green before switching. Green is represented by the *absence* of `data-theme`, so a page that has never been set carries no attribute and no override.

Each palette's `--green-dim` sits between 5.5 and 8.0:1 against its own `--bg3`, matching the green's 5.9:1. Check a new palette against that before adding it — the dim tone is what the secondary text uses everywhere.

While the settings dialog is open the global keyboard shortcuts stand down and only Escape is handled; stopping the radio by typing "s" in a dialog would be a nasty surprise.

## Adding a Built-in Station

Add an entry to `stations.json` (not the JS — `STATIONS` is loaded from this file at runtime):

```json
{ "group": "FO4", "name": "My Station", "url": "https://...stream.mp3", "apiId": 42, "gain": 0.63 }
```

`group` is any label you like; entries sharing one (case-insensitively) form a section.

**Metadata** is usually automatic: an AzuraCast stream URL (`.../listen/<shortcode>/...`) is enough, `detectMeta()` derives the endpoint. Add a field only to override that:

- `"apiId": 42` — legacy shorthand for station 42 on `stations.fallout.radio`. Still honoured, and what the built-in stations use; there is no reason to write a new one.
- `"meta": { "type": "azuracast", "url": "https://host/api/nowplaying/42" }` — any AzuraCast instance.
- `"meta": { "type": "icecast", "url": "https://host/status-json.xsl" }` — Icecast, when the operator has left the endpoint enabled and CORS-open. Most have not.
- Nothing at all — the station plays, the ticker shows `...`.

**Stream formats**: anything `<audio>` decodes (MP3, AAC, Ogg Vorbis, Opus, FLAC) needs no flag. M3U and PLS playlists are resolved to a direct URL when added through the UI; in `stations.json`, point at the resolved stream yourself. HLS is recognised from a `.m3u8` URL; add `"hls": true` only for an HLS stream whose URL does not end in `.m3u8`, since `stations.json` never goes through `resolveStreamUrl()` and so never sees the MIME type or the `#EXT-X-` tags.

`gain` (0–1, default 1) attenuates this station so all stations sound equally loud. It is the *default*: a user who moves the slider overrides it in `localStorage`, and a user who moves it back to this value drops the override. Since `audio.volume` is capped at 1, a quiet stream cannot be boosted — the loud ones are turned *down* instead. `effectiveVolume(idx)` returns `master × gain`. Do **not** reach for the Web Audio API to amplify past 1: `createMediaElementSource()` reroutes the whole element into a graph that receives only silence for these CORS-less cross-origin streams, which silently kills audio on every station (see CHANGELOG 2026-09-14).
