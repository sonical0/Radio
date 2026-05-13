# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-file (`index.html`) Fallout-themed internet radio web app. No build system, no dependencies to install — open `index.html` directly in a browser or serve it with any static file server.

## Running Locally

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Architecture

Everything lives in `index.html` as three inline sections:

1. **CSS** (`<style>`) — Pip-Boy green-on-black terminal aesthetic using CSS variables (`--green`, `--bg`, etc.). Animations: CRT scanline overlay via `body::before`, screen flicker, visualizer bars, ticker scroll, station pulse.

2. **HTML** — Static structure: header + clock, now-playing panel (station name, song ticker, playback controls, volume), streaming progress bar, visualizer, station list (rendered by JS), add-station form.

3. **JavaScript** (`<script>`) — No frameworks. Key data and logic:
   - `STATIONS` array — hardcoded stations with `{ game, name, url, apiId }`. `apiId` maps to the AzuraCast API (`API_BASE = https://stations.fallout.radio/api/nowplaying/`).
   - Custom stations — persisted to `localStorage` as `customStations`; merged with `STATIONS` at load via `loadCustomStations()` / `saveCustomStations()`.
   - `current` — index into the `stations` array of the active station (-1 = none).
   - `buildStationList()` — re-renders the full station list DOM, grouped by `game`.
   - `refreshNowPlaying()` — polls AzuraCast API for all stations with `apiId`, updates `nowPlayingData` map and DOM; runs on load and every 30 s.
   - Visualizer — 34 `div.vis-bar` elements driven by a `setInterval` with random heights when playing; `startVis()` / `stopVis()`.

## Adding a Built-in Station

Add an entry to the `STATIONS` array near the top of the `<script>` block:

```js
{ game:'FO4', name:'My Station', url:'https://...stream.mp3', apiId: 42 }
```

`apiId` is the AzuraCast station ID for "Now Playing" metadata; omit or set to `null` for streams without it.
