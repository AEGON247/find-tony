import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
const seedFile = process.env.SEED_DATA_PATH || path.join(root, "data", "sydney_data.json");
const categories = new Set(["FOODIE", "PARTY", "HACKATHONS", "CHILL"]);
const boundsCoordinates = process.env.SYDNEY_BOUNDS
  ? process.env.SYDNEY_BOUNDS.split(",").map(Number)
  : [-34.05, 150.95, -33.75, 151.30];

if (
  boundsCoordinates.length !== 4 ||
  !boundsCoordinates.every(Number.isFinite) ||
  boundsCoordinates[0] >= boundsCoordinates[2] ||
  boundsCoordinates[1] >= boundsCoordinates[3]
) {
  throw new Error("SYDNEY_BOUNDS must be minLat,minLng,maxLat,maxLng with valid increasing coordinates.");
}

const [minLat, minLng, maxLat, maxLng] = boundsCoordinates;
const sydneyBounds = { minLat, minLng, maxLat, maxLng };

function validCoordinate(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function distanceInMeters(fromLat, fromLng, toLat, toLng) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = radians(fromLat);
  const lat2 = radians(toLat);
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(toLng - fromLng);
  const arc =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

async function loadAlerts() {
  await fs.mkdir(dataDirectory, { recursive: true });
  const alertsFile = path.join(dataDirectory, "alerts.json");
  try {
    const contents = await fs.readFile(alertsFile, "utf8");
    const alerts = JSON.parse(contents);
    if (!Array.isArray(alerts)) {
      throw new Error("Stored alerts must be a JSON array.");
    }
    return { alertsFile, alerts };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { alertsFile, alerts: [] };
    }
    throw error;
  }
}

export async function createApp() {
  const places = JSON.parse(await fs.readFile(seedFile, "utf8"));
  const { alertsFile, alerts: loadedAlerts } = await loadAlerts();
  let alerts = loadedAlerts;
  let alertPersistence = Promise.resolve();
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));
  app.use((request, response, next) => {
    if (["/", "/index.html", "/app.js", "/styles.css", "/sw.js"].includes(request.path)) {
      response.set("Cache-Control", "no-cache");
    }
    next();
  });
  app.use("/vendor/leaflet", express.static(path.join(root, "node_modules", "leaflet", "dist")));
  app.use(express.static(path.join(root, "public"), { extensions: ["html"] }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/api/vibes", (request, response) => {
    const category = request.query.category;
    const lat = Number(request.query.lat);
    const lng = Number(request.query.lng);
    const hasLat = request.query.lat !== undefined;
    const hasLng = request.query.lng !== undefined;

    if (category && !categories.has(category)) {
      return response.status(400).json({ error: "Unknown vibe category." });
    }
    if (hasLat !== hasLng) {
      return response.status(400).json({ error: "Latitude and longitude must be provided together." });
    }
    if (
      hasLat &&
      !validCoordinate(lat, sydneyBounds.minLat, sydneyBounds.maxLat)
    ) {
      return response.status(400).json({ error: "Latitude is outside Sydney bounds." });
    }
    if (
      hasLng &&
      !validCoordinate(lng, sydneyBounds.minLng, sydneyBounds.maxLng)
    ) {
      return response.status(400).json({ error: "Longitude is outside Sydney bounds." });
    }

    const items = [...places, ...alerts]
      .filter((place) => !category || place.category === category)
      .map((place) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return place;
        }
        return {
          ...place,
          distanceMeters: Math.round(distanceInMeters(lat, lng, place.lat, place.lng)),
        };
      })
      .sort((left, right) => (left.distanceMeters ?? Infinity) - (right.distanceMeters ?? Infinity));

    response.json({ items });
  });

  app.post("/api/alerts", async (request, response, next) => {
    const { title, category, lat, lng, details } = request.body ?? {};
    if (typeof title !== "string" || title.trim().length < 3 || title.trim().length > 80) {
      return response.status(400).json({ error: "Title must be between 3 and 80 characters." });
    }
    if (!categories.has(category)) {
      return response.status(400).json({ error: "Choose a valid vibe category." });
    }
    if (
      !validCoordinate(lat, sydneyBounds.minLat, sydneyBounds.maxLat) ||
      !validCoordinate(lng, sydneyBounds.minLng, sydneyBounds.maxLng)
    ) {
      return response.status(400).json({ error: "Alert coordinates must be within Sydney bounds." });
    }
    if (details !== undefined && (typeof details !== "string" || details.length > 280)) {
      return response.status(400).json({ error: "Details must be 280 characters or fewer." });
    }

    const alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      category,
      lat,
      lng,
      details: details?.trim() || "",
      rating: null,
      link: "",
      source: "Community alert",
      createdAt: new Date().toISOString(),
    };
    const persist = alertPersistence.then(async () => {
      const updatedAlerts = [...alerts, alert];
      const temporaryFile = `${alertsFile}.${process.pid}.${alert.id}.tmp`;
      try {
        await fs.writeFile(temporaryFile, `${JSON.stringify(updatedAlerts, null, 2)}\n`, "utf8");
        await fs.rename(temporaryFile, alertsFile);
        alerts = updatedAlerts;
      } catch (error) {
        try {
          await fs.rm(temporaryFile, { force: true });
        } catch (cleanupError) {
          console.error("Could not remove temporary alert data:", cleanupError);
        }
        throw error;
      }
    });
    alertPersistence = persist.catch(() => {});
    try {
      await persist;
    } catch (error) {
      return next(error);
    }
    response.status(201).json({ item: alert });
  });

  app.use((error, _request, response, _next) => {
    console.error("Request failed:", error);
    if (response.headersSent) {
      return;
    }
    response.status(500).json({ error: "The request could not be completed." });
  });

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp()
    .then((app) => {
      app.listen(port, "0.0.0.0", () => {
        console.log(`Find Tony listening on port ${port}`);
      });
    })
    .catch((error) => {
      console.error("Server startup failed:", error);
      process.exitCode = 1;
    });
}
