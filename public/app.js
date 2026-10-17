const CATEGORIES = {
  FOODIE: { color: "#ec4899", label: "FOODIE", symbol: "F" },
  PARTY: { color: "#8b5cf6", label: "PARTY", symbol: "P" },
  HACKATHONS: { color: "#06b6d4", label: "HACKATHONS", symbol: "H" },
  CHILL: { color: "#b7f36b", label: "CHILL", symbol: "C" },
};
const SYDNEY_DEFAULT = [-33.9175, 151.2313];

const elements = {
  splash: document.querySelector("#splash"),
  map: document.querySelector("#map"),
  loading: document.querySelector("#loading-note"),
  card: document.querySelector("#detail-card"),
  count: document.querySelector("#pin-count"),
  location: document.querySelector("#location-status"),
  dialog: document.querySelector("#alert-dialog"),
  form: document.querySelector("#alert-form"),
  error: document.querySelector("#form-error"),
};

let map;
let currentPosition = [...SYDNEY_DEFAULT];
let currentCategory = "FOODIE";
let markers = [];
let userMarker;
let routeLine;
let places = [];
let mapReady = false;

function markerIcon(category) {
  const vibe = CATEGORIES[category] ?? CATEGORIES.FOODIE;
  return L.divIcon({
    className: "vibe-pin",
    html: `<div class="vibe-marker" data-category="${category}"><span>${vibe.symbol}</span></div>`,
    iconSize: [43, 48],
    iconAnchor: [20, 40],
  });
}

function avatarIcon() {
  return L.divIcon({
    className: "radar-avatar",
    html: '<svg class="avatar-svg" viewBox="0 0 48 56" aria-hidden="true"><circle class="avatar-halo" cx="24" cy="28" r="17"/><path class="avatar-arrow" d="M24 4 41 44 24 35 7 44Z"/></svg>',
    iconSize: [48, 56],
    iconAnchor: [24, 28],
  });
}

function initMap() {
  map = L.map(elements.map, { zoomControl: false, preferCanvas: true }).setView(SYDNEY_DEFAULT, 14);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  userMarker = L.marker(currentPosition, { icon: avatarIcon(), keyboard: false, zIndexOffset: 1000 }).addTo(map);
  mapReady = true;
  loadPlaces();
  map.on("click", (event) => {
    if (elements.card.contains(event.originalEvent.target)) return;
    closeCard();
  });
  requestLocation();
}

async function loadPlaces() {
  elements.loading.hidden = false;
  try {
    const params = new URLSearchParams({
      category: currentCategory,
      lat: currentPosition[0],
      lng: currentPosition[1],
    });
    const response = await fetch(`/api/vibes?${params}`);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `Places request failed (${response.status}).`);
    }
    const result = await response.json();
    places = result.items;
    renderPlaces();
  } catch (error) {
    elements.count.textContent = "COULD NOT LOAD SPOTS";
    console.error("Could not load Sydney places:", error);
  } finally {
    elements.loading.hidden = true;
  }
}

function renderPlaces() {
  markers.forEach((marker) => marker.remove());
  markers = places.map((place) => {
    const marker = L.marker([place.lat, place.lng], { icon: markerIcon(place.category), title: place.title })
      .addTo(map)
      .on("click", () => showPlace(place));
    return marker;
  });
  const count = places.length;
  elements.count.textContent = `${String(count).padStart(2, "0")} SIGNAL${count === 1 ? "" : "S"} FOUND`;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "DISTANCE UNAVAILABLE";
  return meters < 1000 ? `${meters}M AWAY` : `${(meters / 1000).toFixed(1)}KM AWAY`;
}

function showPlace(place) {
  const vibe = CATEGORIES[place.category] ?? CATEGORIES.FOODIE;
  document.querySelector("#card-category").textContent = `// ${vibe.label}`;
  document.querySelector("#card-title").textContent = place.title;
  document.querySelector("#card-meta").textContent = formatDistance(place.distanceMeters);
  document.querySelector("#card-details").textContent = place.details || "No extra details yet.";
  document.querySelector("#card-rating").textContent = place.rating == null
    ? "COMMUNITY PIN"
    : `COMMUNITY RATING  ${Number(place.rating).toFixed(1)}/5`;
  document.querySelector("#card-source").textContent = place.source
    ? `INFO: ${place.source}`
    : "COMMUNITY SUBMISSION";
  const info = document.querySelector("#info-link");
  info.hidden = !place.link;
  if (place.link) info.href = place.link;
  const navigate = document.querySelector("#navigate-link");
  navigate.href = `https://www.google.com/maps/dir/?api=1&origin=${currentPosition[0]},${currentPosition[1]}&destination=${place.lat},${place.lng}`;
  elements.card.hidden = false;
  if (routeLine) routeLine.remove();
  routeLine = L.polyline([currentPosition, [place.lat, place.lng]], {
    color: "#06b6d4",
    weight: 4,
    opacity: 0.95,
    dashArray: "7 10",
    lineCap: "square",
    className: "leaflet-routing-line",
  }).addTo(map);
  map.panTo([place.lat, place.lng], { animate: true, duration: 0.35 });
}

function closeCard() {
  elements.card.hidden = true;
  if (routeLine) {
    routeLine.remove();
    routeLine = undefined;
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    elements.location.textContent = "UNSW / KENSINGTON (DEMO LOCATION)";
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      currentPosition = [coords.latitude, coords.longitude];
      userMarker.setLatLng(currentPosition);
      if (Number.isFinite(coords.heading)) {
        userMarker.getElement()?.querySelector(".avatar-arrow")
          ?.style.setProperty("transform", `rotate(${coords.heading}deg)`);
      }
      map.setView(currentPosition, 14);
      elements.location.textContent = "LIVE LOCATION";
      loadPlaces();
    },
    () => {
      elements.location.textContent = "UNSW / KENSINGTON (DEMO LOCATION)";
    },
    { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
  );
}

document.querySelector("#initialize").addEventListener("click", () => {
  elements.splash.classList.add("is-dismissed");
  window.setTimeout(() => {
    elements.splash.hidden = true;
    initMap();
  }, 400);
});

let installPrompt;
const installButton = document.querySelector("#install-app");
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = undefined;
  installButton.hidden = true;
});
window.addEventListener("appinstalled", () => {
  installPrompt = undefined;
  installButton.hidden = true;
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error) => {
        console.error("Could not register or update offline app support:", error);
      });
  });
}

document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".filter-chip.is-active")?.classList.remove("is-active");
    button.classList.add("is-active");
    currentCategory = button.dataset.category;
    closeCard();
    if (mapReady) loadPlaces();
  });
});

document.querySelector("#locate").addEventListener("click", () => {
  map.setView(currentPosition, 15, { animate: true });
});
document.querySelector("#close-card").addEventListener("click", closeCard);
document.querySelector("#open-alert").addEventListener("click", () => {
  elements.error.hidden = true;
  elements.dialog.showModal();
});
document.querySelector("#close-alert").addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.error.hidden = true;
  const submit = elements.form.querySelector('[type="submit"]');
  submit.disabled = true;
  const formData = new FormData(elements.form);
  try {
    const response = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formData.get("title"),
        category: formData.get("category"),
        details: formData.get("details"),
        lat: currentPosition[0],
        lng: currentPosition[1],
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Could not publish alert (${response.status}).`);
    elements.form.reset();
    elements.dialog.close();
    currentCategory = result.item.category;
    document.querySelector(".filter-chip.is-active")?.classList.remove("is-active");
    document.querySelector(`[data-category="${currentCategory}"].filter-chip`)?.classList.add("is-active");
    await loadPlaces();
    const newPlace = places.find((place) => place.id === result.item.id);
    if (newPlace) showPlace(newPlace);
  } catch (error) {
    elements.error.textContent = error.message;
    elements.error.hidden = false;
  } finally {
    submit.disabled = false;
  }
});
