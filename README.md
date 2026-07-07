# pyLoad Connector

**English** | [Italiano](README.it.md)

A Chrome extension (Manifest V3) to send links to a [pyLoad](https://pyload.net/) server — an alternative to Yape. Compatible with **pyLoad 0.5.0 (pyload-ng)**: it uses the `/json/add_package` endpoint with the browser session and CSRF token, since the legacy `/api/login` and `/api/addPackage` endpoints respond 404 "Obsolete API" on 0.5.0.

## Features

- **Context menu** — right-click on a link, an image, a video, selected text or the page → **"Download with pyLoad"**. All URLs are automatically extracted from selected text.
- **Download interception** (optional) — the download **starts normally in Chrome**, and at the same time an **in-page modal** asks what to do with it:
  - **Continue with pyLoad** — the Chrome download is cancelled and the link is sent to the server instead;
  - **Continue with Chrome** — nothing happens, the download keeps going on its own;
  - **Cancel** (also with Esc or by clicking outside the modal) — the download is stopped and nothing is sent to pyLoad.

  Where the modal cannot be injected (`chrome://` pages, Web Store…) a centered chooser window opens instead. If sending to pyLoad fails (e.g. expired session), the Chrome download is left running so nothing is lost.
- **Icon click** — the pinned extension icon works as an interception toggle: green **ON** badge when active.
- **Notifications** confirming success or reporting errors after every send.
- **Multilingual** — English (default) and Italian, selected automatically from the browser language (`chrome.i18n`, `_locales/` folder).

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **"Load unpacked"** and select the repository folder.

## Configuration

Open the extension **Options** (right-click the icon → Options) and set:

| Field | Description |
|---|---|
| Protocol | `http` or `https` |
| Address | Host or IP of the pyLoad server (e.g. `192.168.1.10`, paths for reverse proxies work too: `nas.local/pyload`) |
| Port | Web interface port (pyLoad default: `8000`; leave it empty behind a reverse proxy) |
| Destination | Queue (start immediately) or Collector (add without starting) |
| Fixed package name | If empty, the package name is derived from the file name or the site of the link |
| Intercept downloads | Enables the prompt before every Chrome download |

The **"Test connection"** button checks that the server responds and the session is active.

## Authentication

pyLoad 0.5.0 no longer exposes an API login: the extension **reuses the browser session**.

1. Log in normally to the pyLoad web interface in a browser tab.
2. The extension reuses that session cookie and extracts the CSRF token from the `/dashboard` page before every send.
3. If the session is missing or expired, the extension shows a link to reopen the web interface and log in again.

No credentials are stored in the extension.

## API used

- `GET /dashboard` — session check and CSRF token extraction from the `<meta name="csrf-token">` tag
- `POST /json/add_package` — `multipart/form-data` body with `add_name`, `add_links` (newline-separated URLs) and `add_dest` (0 = Collector, 1 = Queue); `X-CSRFToken` and `X-Requested-With: XMLHttpRequest` headers, session cookies included (field names as in the pyload-ng `json_blueprint.py` source)

Note: the documented `/api/*` endpoints of pyLoad 0.5.0 (e.g. `/api/add_package`) do not accept the session authentication used by the web frontend; the extension uses the same `/json/*` endpoints as the web interface.

## About the icons

The bundled icons are a pyLoad-style recreation (download arrow on a blue circle). To use the official logo, replace the files in `icons/` (`icon16.png`, `icon48.png`, `icon128.png`) with the resized official PNG.
