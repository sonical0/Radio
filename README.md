**English** · [Français](./README.fr.md)

# Fallout Radio — Android app

The React Native port of the [browser player](https://github.com/sonical0/Radio/tree/main):
the eleven Fallout in-game stations, any stream you add, and a directory of ~50,000 more —
playing in the background, with lock-screen controls.

**▶ [Download the APK](https://github.com/sonical0/Radio/releases)** — version 1.1.1, signed,
installed and used on a phone. Android only; iOS would need a Mac to build.

> The interface is in French, like the site.

## What it does that the page cannot

**It amplifies.** A browser cannot go past `volume = 1`, so a station broadcast fifteen
decibels below the rest can only be fixed by turning *everything else down* — which makes the
whole player quieter than the phone. A local native module adds the missing gain instead:
+11 dB on Mojave Music Radio, +13 on Radio New Vegas, both measured.

**It reads the title out of the stream.** Nearly every Icecast and Shoutcast server interleaves
its current track in the audio itself (ICY). The native player reads it, so even a web radio
pulled from the directory — one with no metadata endpoint at all — shows what is playing.
From a browser, the same probe answered on **0 stations out of 12**: the CORS header is simply
not there. Natively, 3 out of 7 answer.

Everything else matches the site, feature for feature: groups, per-station gain, hidden-station
bin, manual add, import/export, sleep timer, directory search, and the Pip-Boy skin with its
four screen colours.

## Build it yourself

```bash
cd app
npm install
npm run android    # device or emulator; dev build, not Expo Go
npm run web        # the same code in a browser
```

A signed release APK comes out of `cd android && ./gradlew assembleRelease`. The keystore is
deliberately outside the repository, so that command needs your own.

**Read [`app/README.md`](./app/README.md) before touching the dependencies or the build.**
It is the real documentation of this branch, in French: what each milestone delivered, why the
player is `@rntp/player` v5 and not `react-native-track-player` v4, how the gains were
measured, and the three Windows build traps that cost the most time — the SDK path that must
contain no space, the JDK 17 requirement, and the 260-character limit that `LongPathsEnabled`
does *not* lift.

## What else is in this branch

`index.html`, `stations.json`, `Dockerfile` and the rest of the site are here as a **copy of
`main`**, kept aligned so that both targets share one station list. They are documented on
`main`, not here, and they travel between branches by `cherry-pick` — never by copying a file
from one branch onto another, which once silently reverted three of the site's features.

`react-native/dev` carries the work; `react-native/main` only receives what has run on a real
device.

## License

[MIT](./LICENSE) for this project's code. `@rntp/player` is free for personal and educational
use and requires a licence for commercial use — this project is personal, which is the only
reason it qualifies.

Fallout is a trademark of Bethesda Softworks. This is an unaffiliated fan project.
