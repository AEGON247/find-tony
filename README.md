# Find Tony // Sydney

Find Tony is a Next.js 16 App Router application for discovering food, events, nightlife, and study spots around Sydney. It uses a 2D React-Leaflet map, local profile preferences, device-location distance filtering, an installable PWA shell, and live public event listings from Luma and optionally Eventbrite.

## Run locally

Requires Node.js 20 or later.

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Grant location permission to load the map, search nearby places, and enable check-ins. There are no bundled sample locations or fixed-campus coordinate fallbacks. The map starts at zoom 16.5 around the device location. Profile preferences and check-in progress are stored only in localStorage.

The public Luma Sydney discovery feed and OpenStreetMap Overpass/Nominatim place data require no API keys. `EVENTBRITE_API_KEY` optionally enables a second live event provider; Luma remains the primary event source, and event listings are filtered to upcoming events with usable Sydney coordinates and the selected radius. `FOURSQUARE_API_KEY` (or `FOURSQUARE_SERVICE_KEY` / the legacy `FOURSQUARE_KEY`) optionally enables Foursquare Places after Overpass and before Nominatim for venue categories. Provider keys are read only on the server and must never use a `NEXT_PUBLIC_` variable. Nearby map places use a 30-minute success cache, race public Overpass endpoints with a 1.5-second abort budget, and fall back to Foursquare and then Nominatim when those endpoints fail. Expired cached results are served while live data refreshes in the background. The app does not bundle static venue coordinates or seeded Sydney places. The map uses OpenStreetMap raster tiles with a CSS grayscale/dark treatment; no map key is required.

For a local production run, optionally copy `.env.example` to `.env`, then build and start:

```sh
npm run build
npm start
```

## API

- `GET /api/vibes?category=EVENTS&lat={lat}&lng={lng}&radius=3` combines upcoming Luma events, optional Eventbrite results, and community event pins. Live event titles are used to infer starting event-type tags; available public listing descriptions, times, registration links, and images are shown where supplied.
- `GET /api/vibes?category=FOODIE&lat={lat}&lng={lng}&radius=3` returns nearby live map places and saved community places. Venue categories use OpenStreetMap Overpass, optional Foursquare, and Nominatim fallback. Provider failures are surfaced as warnings while saved community places remain available.
- `POST /api/alerts` persists a community pin in `DATA_DIR/alerts.json`; spots submitted as EVENTS can include an event type.
- `POST /api/place-tags` adds a shared custom tag for a place in `DATA_DIR/place-tags.json`.
- `POST /api/reports` saves a place-removal/accuracy report in `DATA_DIR/reports.json` for team review and locally hides the reported place on that browser.
- `GET /healthz` returns HTTP 200 for deployment health checks.

Community spots, community event tags, custom place tags, and submitted report records are shared through the server's persistent data directory. They survive restarts only when that directory is mounted persistently. This JSON-file persistence is intended for a single app instance; separate replicas with independent filesystems will not share updates, and concurrent writes across replicas are not coordinated. Place information reflects available public map tags and may be incomplete or out of date; verify venue hours and access with the venue. Unavailable descriptions, event details, prizes, and offers are not invented.

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

Compose serves port 3000. Override the host-facing port with `PORT` if needed. Community places, custom tags, and report records persist in the `find-tony-data` volume at `/app/data`. To enable optional providers, set `FOURSQUARE_API_KEY` (or `FOURSQUARE_SERVICE_KEY` / `FOURSQUARE_KEY`) and/or `EVENTBRITE_API_KEY` in the environment used by Docker Compose. Copying `.env.example` to `.env` is a convenient local setup; provide valid provider credentials there if required.

For Zenith, deploy the Dockerfile with HTTP port 3000, forward `/` to the app, and configure `GET /healthz` as the health probe. Provider credentials are optional; configure the relevant server-side environment variables for Foursquare or Eventbrite if using those providers. Mount persistent storage at `/app/data` for community places, shared tags, and report records.
