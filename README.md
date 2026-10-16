# Find Tony // Sydney

Find Tony is a Next.js 16 App Router application for discovering food, events, nightlife, and study spots around Sydney. It uses a 2D React-Leaflet map, local profile preferences, device-location distance filtering, an installable PWA shell, and live public event listings from Luma and OpenStreetMap.

## Run locally

Requires Node.js 20 or later.

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Grant location permission to load the map, search nearby places, and enable check-ins. There are no bundled sample locations or fixed-campus coordinate fallbacks. The map starts at zoom 16.5 around the device location. Profile preferences and check-in progress are stored only in localStorage.

The public Luma Sydney discovery feed and OpenStreetMap Overpass/Nominatim place data require no API keys. Luma events are refreshed every minute and filtered to upcoming events with usable Sydney coordinates; the selected search radius is applied before results are shown. Nearby map places use a 30-minute success cache, rotate through public Overpass endpoints within a bounded request budget, and fall back to Nominatim. Failed provider results are retried quickly, while recently cached places can be shown during an outage. The map uses OpenStreetMap raster tiles with a CSS grayscale/dark treatment; no map key is required.

For a local production run, optionally copy `.env.example` to `.env`, then build and start:

```sh
npm run build
npm start
```

## API

- `GET /api/vibes?category=FOODIE&lat={lat}&lng={lng}&radius=3` returns live nearby map places, Luma events, and saved community places for the requested category and radius. Available venue tags (such as cuisine, opening hours, and outdoor seating) are used for factual details.
- All categories query nearby OpenStreetMap data through Overpass, with Nominatim fallback, before applying the exact radius filter. Provider failures are surfaced as warnings while saved community places remain available.
- `POST /api/alerts` persists a community pin in `DATA_DIR/alerts.json`.
- `GET /healthz` returns HTTP 200 for deployment health checks.

Place information reflects available public map tags and may be incomplete or out of date; verify venue hours and access with the venue. Event details come from public Luma listings; unavailable descriptions, prizes, and offers are not invented.

Place details open inside the app. The panel includes an available photo, factual address/type/accessibility details, mapped opening hours, event times, directions drawn on the map, local save, nearby search, and native sharing when the browser supports it. Reviews and ratings are shown only when supplied by a verified source; this app does not manufacture ratings or review text. Sending to another device requires an account or device-pairing service and is not offered.

## User profile and location

The profile drawer lets users set an alias, default vibe, and radius. The default radius is 3 km. Device location is required to search nearby and is sent to the Find Tony backend, which uses it to request nearby map data from public OpenStreetMap services. Device location is not stored as location history. Nearby places can be checked into within 50 m, contributing to locally stored streaks and badges.

## PWA

Serve the app over HTTPS (or use `localhost` for local development), then use the browser's **Install app** prompt / **Add to Home Screen** action. The service worker caches app navigation and previously fetched place responses; map tiles and alert publishing need an internet connection. OpenStreetMap tile use is subject to its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Docker and Zenith Hosting

Build and run the production standalone container with:

```sh
docker compose up --build
```

Compose serves port 3000. Override the host-facing port with `PORT` if needed. Community alert JSON persists in the `find-tony-data` volume at `/app/data`.

For Zenith, deploy the Dockerfile with HTTP port 3000, forward `/` to the app, and configure `GET /healthz` as the health probe. No provider credentials are required. Mount persistent storage at `/app/data` for community-submitted places.
