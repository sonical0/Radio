# Docker

The app is containerized via `Dockerfile` (`nginxinc/nginx-unprivileged:1.27-alpine` — runs as non-root `uid=101`, serving `index.html` and `stations.json`, with a custom `nginx.conf` adding gzip + security headers, and a `HEALTHCHECK`) and `docker-compose.yml` (maps container port 8080 to host port 8080, plus `read_only`/`tmpfs`/`cap_drop`/`no-new-privileges` hardening).

## Security headers

`nginx.conf` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and a `Content-Security-Policy`. `connect-src`/`media-src` in the CSP stay open to any `http(s)` origin on purpose — the app's core feature lets users add a radio stream on any domain, so those directives can't be locked down to an allowlist.

The CSP allows **no third-party host at all**: the two webfonts and the favicon are embedded in `index.html` as `data:` URIs, so `font-src`/`img-src` need only `'self' data:`. The page therefore renders identically offline and on an isolated LAN.

## Caching

`nginx.conf` sets `Cache-Control: no-cache` on everything it serves. Every file is tiny and baked into the image, so revalidation costs a 304 — without it, rebuilding the image would leave a stale `index.html` sitting in visitors' browser caches.

## Container hardening

Runs as the unprivileged `nginx` user (uid 101) via the `nginxinc/nginx-unprivileged` image (the official `nginx` image needs root to bind port 80/443; this variant listens on 8080 instead and never elevates). `docker-compose.yml` also sets `read_only: true` (with `tmpfs` for the few paths nginx needs to write: `/var/cache/nginx`, `/var/run`, `/tmp`), drops all Linux capabilities (`cap_drop: [ALL]`), and sets `no-new-privileges`.

## Deploying beyond localhost (TLS)

This setup serves plain HTTP on port 8080, with no TLS termination. For anything reachable outside `localhost`, put a reverse proxy in front that handles HTTPS (e.g. Traefik, Caddy, or nginx-proxy + certbot) and forwards to this container's port 8080 — don't expose it directly on the internet without one.

## Running via CLI

```bash
docker compose up -d --build
# then open http://localhost:8080
docker compose down   # stop and remove the container
```

## Adding this container in Docker Desktop (GUI)

If you'd rather use Docker Desktop's UI instead of the CLI:

1. Open **Docker Desktop** → left sidebar → **Containers**.
2. Click **Compose** (or use **+ Add** → **Existing compose file** depending on version) and browse to this project's `docker-compose.yml`. Docker Desktop will build the image and start the `radio` service automatically — this is the same as running `docker compose up -d --build`, just driven from the GUI.
3. Alternatively, to build a standalone container without Compose:
   - Go to **Images** → **Build** (or run `docker build -t radio .` from this folder in a terminal — Docker Desktop doesn't have a "build from Dockerfile" button in older versions, so the CLI build is usually simpler).
   - Once the `radio` image appears under **Images**, click it → **Run**.
   - In the **Run** dialog, expand **Optional settings** and set:
     - **Container name**: `radio` (or anything memorable)
     - **Host port**: `8080` mapped to **Container port** `8080`
   - Click **Run**. The container now shows up under **Containers**, and clicking its port link (`8080:8080`) opens it in the browser.
4. To stop/remove it later, find the container under **Containers** and use the stop (■) and delete (🗑) icons, or the corresponding `docker stop` / `docker rm` commands.

## General pattern for adding *any* new container in Docker Desktop

- **From an existing image** (e.g. pulled from Docker Hub): **Images** tab → search/pull the image → click it → **Run**, set name/ports/volumes/env vars in **Optional settings** → **Run**.
- **From a local Dockerfile**: build it first (`docker build -t <name> .` in the project folder, or Docker Desktop's **Builds** tab if using BuildKit/Bake), then run it as above.
- **From a `docker-compose.yml`**: use the **Compose** view — Docker Desktop reads all services in the file and starts them together, showing them grouped under one project in the **Containers** tab.
