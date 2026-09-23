**English** · [Français](./README.fr.md)

# Fallout Radio

A Pip-Boy-styled internet radio player for the browser. Ships the eleven Fallout in-game
stations out of the box, plays any web radio you point it at, and searches a directory of
~50,000 more.

No build step, no package manager, no framework. Serve the folder and it runs.

**▶ [sonical0.github.io/Radio](https://sonical0.github.io/Radio/)**

![The player tuned to Diamond City Radio, showing live track metadata for every station](docs/screenshot.png)

> The interface is in French.

## Features

- **The eleven Fallout stations** — Fallout 3, New Vegas, 4 and 76 — with live "now playing"
  metadata for each.
- **Any stream you like.** MP3, AAC, Ogg Vorbis, Opus and FLAC play as-is. M3U and PLS
  playlists are resolved to a direct URL. HLS (`.m3u8`) works too, which is what most large
  broadcasters serve.
- **Metadata without configuration.** Paste an AzuraCast stream URL and the track title
  appears on its own — the API endpoint is derived from the URL. Icecast servers can be
  pointed at by hand.
- **A directory built in.** Search [Radio-Browser](https://www.radio-browser.info/) by name
  or genre, or browse it by country (pin the ones you come back to) or by genre, sorted by
  listens, votes, trend, name or at random — and add a station in one click.
- **Your own groupings.** A group is a free label — a game, a genre, a country — not a fixed
  list.
- **Per-station gain**, measured rather than guessed: every station's loudness was sampled
  with `ffmpeg -af ebur128` and the gains bring them to a common target.
- **Search your own list.** Past eight visible stations, a filter field appears above the
  list, matching names and groups whatever the accents and the case. It filters the display
  only — the arrow keys keep walking the whole library.
- **The titles that went past.** The page already polls every visible station's metadata
  every thirty seconds; it now keeps the result, timestamped and searchable. 600 titles in
  all, 200 per station, in a drawer under the list. Nothing leaves the browser, and clearing
  asks twice.
- **Hide any station you don't listen to**, built-in ones included. Hiding is reversible: a
  "hidden stations" drawer at the bottom of the list brings them back one by one.
- **A screen colour you choose.** The ⚙ button next to the clock swaps the phosphor between
  green, amber, blue and white, like a Pip-Boy — or, as Fallout 4 allows, any hue on a
  slider, with the whole palette derived from it and kept as readable as the fixed screens.
  The choice is stored and re-applied by a script in the `<head>`, before the first paint,
  so the page never flashes the wrong colour.
- **Sleep timer** with a slow fade-out, **media keys** and lock-screen controls via the Media
  Session API, **keyboard shortcuts**, and automatic reconnection when a stream drops.
- **Import / export** your custom stations as JSON, in the same file the Android app reads
  and writes. The alarms it puts there cross the page unread and unharmed: exporting from the
  browser does not amputate the phone's backup. The same button also takes an `.m3u` or
  `.pls` playlist from another player (VLC, Winamp, foobar2000…), names, logos and groups
  included.
- **An Android app**, in React Native, sharing this station list. It does two things this page
  cannot: it amplifies the stations that are broadcast too quietly to be fixed by attenuating
  the others, and it reads the title out of the stream itself. The radio alarm clock and the
  home-screen widget are its own, and will stay so: a closed tab does not ring.
  [Download the APK](https://github.com/sonical0/Radio/releases) — source and its own README
  on the `react-native/main` branch.
- **Offline-identical rendering.** Fonts, favicon and the HLS library are all served from the
  folder — nothing is fetched from a CDN at load time.

## Quick start

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

Any static file server will do. Opening `index.html` straight from the filesystem will *not*
work: `stations.json` is fetched at load, and `file://` blocks that.

### Docker

```bash
docker compose up -d --build
# → http://localhost:8080
```

nginx-unprivileged, running as a non-root user, with gzip and security headers.
See [DOCKER.md](./DOCKER.md).

## Adding stations

**From the interface** — unfold *Add a station* at the bottom of the list and paste a stream
URL, or search the directory. The form is folded away by default: it is used once in a while,
and the station list is what you came for.
Custom stations live in `localStorage`, so they survive reloads and never leave your browser.

**Built in** — add an entry to `stations.json`:

```json
{ "group": "FO4", "name": "My Station", "url": "https://example.org/listen/mine/radio.mp3" }
```

Metadata is usually automatic. To override it, or to reach an Icecast server:

```json
{ "meta": { "type": "icecast", "url": "https://example.org/status-json.xsl" } }
```

Optional fields: `gain` (0–1, attenuates a stream that is louder than the rest), `hls` (only
needed when an HLS stream's URL does not end in `.m3u8`), and `boost` (decibels, **ignored
here** — a browser cannot amplify past the maximum; the mobile app reads it).

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Play / pause |
| <kbd>←</kbd> <kbd>→</kbd> | Previous / next station |
| <kbd>↑</kbd> <kbd>↓</kbd> | Volume |
| <kbd>M</kbd> | Mute |
| <kbd>S</kbd> | Stop |

## How it works

Everything lives in `index.html` — styles, markup and logic, ~140 KB of it, no dependencies
beyond the vendored HLS library. A few decisions worth knowing about:

**No Web Audio API.** It would be the obvious way to boost a quiet stream past `volume = 1`,
and it silently breaks every station: `createMediaElementSource()` reroutes the element into
a graph that receives nothing but silence for these CORS-less cross-origin streams. Loud
stations are turned *down* instead, per-station.

**hls.js is pinned and served locally**, not pulled from a CDN, so the page renders and plays
the same offline and on an isolated network. It takes precedence over the browser's native
HLS support even where `canPlayType()` claims it — some engines answer `"maybe"` with only
partial support, and hls.js surfaces errors the reconnection logic can act on. Native
playback remains the iOS path, where MSE does not exist.

**Metadata is limited by CORS, not by ambition.** AzuraCast and Icecast are the only two
families that reliably send the header from a browser. Shoutcast v2 sends none at all, and
most Icecast operators switch their status endpoint off — which is why AzuraCast, derived
straight from the stream URL, carries most of the weight.

**The station list is a real list.** Each row is a `<li>` containing a `<button>`, not a
`<li role="button">` — the latter flattens its subtree and hides the nested gain slider and
delete control from screen readers.

Further notes for contributors are in [CLAUDE.md](./CLAUDE.md); the full history is in
[CHANGELOG.md](./CHANGELOG.md).

## Browser support

Chrome, Edge, Firefox and Safari, desktop and mobile. HLS goes through hls.js everywhere
except iOS, which plays it natively.

## Branches

This branch, `main`, is the whole browser target: the page, the station list, and the Docker
setup that serves them. It is what GitHub Pages deploys, and it has no build step.

`react-native/main` and `react-native/dev` hold the Android app, stable and working
respectively. They carry a copy of the site files so both targets share one station list, and
their own README describes the app, not this page.

There used to be a `dockerized` branch. It was deleted on 2026-09-19: every Docker file
lives here, and the branch had fallen behind on all of them — it served an `index.html` from
before HLS, the directory and the colour picker, which is worse than no branch at all.

## License

[MIT](./LICENSE) — for this project's own code.

Bundled third-party code keeps its own terms: `vendor/hls.light.min.js` is
[hls.js](https://github.com/video-dev/hls.js) under Apache-2.0, with its notice in
`vendor/hls.js-LICENSE.txt`.

## Credits

- Stream and metadata API: [fallout.radio](https://fallout.radio/)
- Station directory: [Radio-Browser](https://www.radio-browser.info/)
- Fonts: [VT323](https://fonts.google.com/specimen/VT323) and
  [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono), SIL Open Font License

## Streams

This project broadcasts and hosts no audio. It is a player: it opens public URLs served by
[fallout.radio](https://fallout.radio/), plus whatever stream the user adds. The games' music
belongs to Bethesda Softworks and to the respective rights holders, and broadcasting it is the
business of whoever runs those streams, not of this repository — which contains URLs and no
audio file. When a station falls silent, it fell silent at the source.

## Data

No account, no analytics, no cookie, no server of mine. Everything you set up — stations,
groups, gains, screen colour — the titles that went past and how long you listened to each station stay in your browser's local storage and are never sent
anywhere, with one exception: a station you added yourself has its stream address looked up
once in the Radio-Browser directory when you play it, to find its image. The export is a file
you download yourself. Four third parties do see your IP address while you use the page: the
server of the station you are listening to (fallout.radio, or one you added yourself), the
site hosting that station's image when the directory has one, the Radio-Browser API when you
search the directory or play one of its stations (it counts listens, one per address and per
day), and GitHub Pages, which serves the page. Their own policies apply. This project has
none, because it collects nothing.

Fallout is a trademark of Bethesda Softworks. This is an unaffiliated fan project.
