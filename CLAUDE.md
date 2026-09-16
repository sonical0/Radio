# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-file (`index.html`) Fallout-themed internet radio web app. No build system, no dependencies to install — open `index.html` directly in a browser or serve it with any static file server.

No external network dependencies at render time: the two webfonts and the favicon are embedded as `data:` URIs, so the UI renders identically offline, on an isolated LAN, and when opened over `file://`. Only the audio streams and the AzuraCast "Now Playing" API go out to the network.

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
   - `STATIONS` — built-in stations, fetched at runtime from `stations.json` (`{ game, name, url, apiId, gain }`). `apiId` maps to the AzuraCast API (`API_BASE = https://stations.fallout.radio/api/nowplaying/`).
   - Custom stations — persisted to `localStorage` as `customStations` (schema-validated via `isValidStation()`); merged with `STATIONS` at load via `loadCustomStations()` / `saveCustomStations()`. Each station object carries `isCustom: true/false` — built-in vs custom is tracked by that flag, not by array position.
   - Per-station gain — `sanitizeGain()` coerces a missing, non-numeric or out-of-range `gain` to 1 (an `NaN` would make `audio.volume = NaN` throw), `stationGain(idx)` reads it, `effectiveVolume()` multiplies it by the master volume. Custom stations get an inline slider built by `buildGainControl()`: `applyStationGain()` on `input` (audible immediately when that station is playing), `saveCustomStations()` on `change` only, so a drag is one `localStorage` write. The control stops `click`/`keydown`/`pointerdown` from bubbling, otherwise adjusting it would trigger the row's play handler. Built-in gains stay in `stations.json` and are not editable from the UI.
   - `current` — index into the `stations` array of the active station (-1 = none).
   - `buildStationList()` — re-renders the full station list DOM (`<section>`/`<ul>`/`<li>`), grouped by `game`. Each `<li>` stays a plain `listitem` (so the `<ul>` keeps its list semantics) and the tune-in action is a real `<button class="station-btn" id="stb-N">` holding the station name, with `aria-pressed` and `aria-describedby` pointing at the now-playing text. Its `::after` stretches the click target over the whole row while keeping the focusable element small; the gain slider and delete button are siblings lifted above it with `z-index`, so they stay clickable and exposed to assistive tech. Do **not** put `role="button"` back on the `<li>`: a button flattens its subtree, which hid both nested controls from screen readers and broke the list semantics.
   - `renderStatus(el, key)` / `setStationStatus(idx, key)` / `setStationPressed(idx, bool)` — the only writers of a row's status text and pressed state (`STATION_STATUS` holds the labels). `renderStatus()` takes the element, `setStationStatus()` resolves it by id — `buildStationList()` must call the former, because it fills each row before attaching it to the document, where `getElementById` still returns null. The leading glyph goes in an `aria-hidden` span so "■ ON AIR" is announced as "ON AIR". The visible status is `aria-hidden` as a whole since `aria-pressed` already carries that state; transient stream states reach screen readers through the `aria-live` `#np-station` instead.
   - `refreshNowPlaying()` — polls AzuraCast API for all stations with `apiId`, updates the `nowPlayingData` map and DOM; runs on load and every 30 s, skipped while the tab is hidden (Page Visibility) or a previous poll is still in flight. `nowPlayingData` is keyed by stream **URL**, not array index, so adding or deleting a station never shifts entries — read it through `npFor(idx)`.
   - `handleStreamDrop()` — reconnection logic (up to 3 attempts, 2 s apart) before giving up and showing "FLUX INTERROMPU". Triggered immediately on an audio `error`, but only after `STALL_GRACE_MS` on `stalled` — and then only if `currentTime` has not advanced meanwhile, since `stalled` also fires on mere network slowness. A `waiting` event shows "⟳ TAMPON…" without reconnecting.
   - `updateMediaSession()` — feeds the Media Session API so OS media keys, the lock screen and headset buttons work; play/pause/stop/previoustrack/nexttrack handlers are bound once at load.
   - Keyboard shortcuts — a global `keydown` handler (Space, ←/→, ↑/↓, M, S). It ignores events coming from form fields, Space on a focused `<button>` (the browser already activates it), and anything already `defaultPrevented` by the station list's own Enter/Space handling.
   - Sleep timer — `cycleSleepTimer()` steps through `SLEEP_STEPS_MIN` (off / 15 / 30 / 60 / 90 min); `onSleepTick()` fades the volume over the final `SLEEP_FADE_MS` then calls `stopRadio()`. `cancelSleepTimer()` restores the gain-corrected volume so an interrupted fade never leaves the audio quiet.
   - `restoreLastStation()` — re-selects the station stored in `localStorage.lastStationUrl` on load, marked with the `.selected` class (distinct from `.playing`, which pulses). It never autoplays.
   - `resolveStreamUrl()` — resolves M3U/PLS playlists to a direct stream URL (6 s timeout). Playlist entries are resolved against the playlist URL (relative paths work) and re-checked with `isPrivateHost()` + a protocol check, so a remote playlist cannot redirect the player at a local service; a rejected entry comes back as `{ blocked: true }`. `isPrivateHost()` also gates the URL the user types (best-effort SSRF guard).
   - `exportStations()` / `importStations()` — download/upload custom stations as JSON, with schema + host validation on import.
   - Visualizer — 34 `div.vis-bar` elements driven by a `setInterval` with random heights when playing; `startVis()` / `stopVis()`. Heights are decorative, not real FFT data (see "Adding a Built-in Station" for why Web Audio is off-limits here). Paused while the tab is hidden.

## Adding a Built-in Station

Add an entry to `stations.json` (not the JS — `STATIONS` is loaded from this file at runtime):

```json
{ "game": "FO4", "name": "My Station", "url": "https://...stream.mp3", "apiId": 42, "gain": 0.63 }
```

`apiId` is the AzuraCast station ID for "Now Playing" metadata; omit or set to `null` for streams without it.

`gain` (0–1, default 1) attenuates this station so all stations sound equally loud. Since `audio.volume` is capped at 1, a quiet stream cannot be boosted — the loud ones are turned *down* instead. `effectiveVolume(idx)` returns `master × gain`. Do **not** reach for the Web Audio API to amplify past 1: `createMediaElementSource()` reroutes the whole element into a graph that receives only silence for these CORS-less cross-origin streams, which silently kills audio on every station (see CHANGELOG 2026-09-14).
