"use client";

import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { Navigation } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AlertModal from "@/components/AlertModal";
import PlaceDetailPanel from "@/components/PlaceDetailPanel";
import ProfileModal from "@/components/ProfileModal";
import SplashScreen from "@/components/SplashScreen";
import VibeHeader from "@/components/VibeHeader";
import { VibeProvider, useVibe } from "@/context/VibeContext";
import type { Category, VibePlace } from "@/lib/types";
import PwaRegister from "@/components/PwaRegister";
import { distanceInMeters } from "@/lib/geo";

interface CheckInRecord {
  placeId: string;
  category: Category;
  checkedAt: string;
}
const CHECK_INS_KEY = "find-tony-check-ins-v1";
const REPORTED_PLACES_KEY = "find-tony-reported-places-v1";

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => <div className="map-loading">LOADING SYDNEY MAP...</div>,
});

function FindTonyApp() {
  const {
    profile, updateProfile, coordinates, locationLabel, requestLocation, requestHeading,
  } = useVibe();
  const [categoryOverride, setCategoryOverride] = useState<Category>();
  const category = categoryOverride ?? profile.primaryVibe;
  const [started, setStarted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [selected, setSelected] = useState<VibePlace>();
  const [navigationTarget, setNavigationTarget] = useState<VibePlace>();
  const [searchCenter, setSearchCenter] = useState<[number, number]>();
  const [places, setPlaces] = useState<VibePlace[]>([]);
  const [reportedPlaceIds, setReportedPlaceIds] = useState<string[]>([]);
  const [communityStatus, setCommunityStatus] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent>();
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([]);
  const [checkInsLoaded, setCheckInsLoaded] = useState(false);
  const sharedPlaceId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    sharedPlaceId.current = params.get("placeId") ?? undefined;
    const sharedCategory = params.get("category");
    if (sharedCategory && ["FOODIE", "PARTY", "EVENTS", "CHILL", "HACKATHONS"].includes(sharedCategory)) {
      setCategoryOverride((sharedCategory === "HACKATHONS" ? "EVENTS" : sharedCategory) as Category);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHECK_INS_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCheckIns(parsed.flatMap((record): CheckInRecord[] =>
            typeof record?.placeId === "string" &&
            ["FOODIE", "PARTY", "EVENTS", "HACKATHONS", "CHILL"].includes(record.category) &&
            typeof record.checkedAt === "string" &&
            Number.isFinite(Date.parse(record.checkedAt))
              ? [{ ...record, category: record.category === "HACKATHONS" ? "EVENTS" : record.category }]
              : [],
          ));
        }
      }
    } catch {
      console.warn("Could not load local check-in history.");
    }
    setCheckInsLoaded(true);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REPORTED_PLACES_KEY);
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
        setReportedPlaceIds(parsed);
      }
    } catch (error) {
      console.error("Could not load locally hidden places.", error);
    }
  }, []);

  useEffect(() => {
    if (!checkInsLoaded) return;
    try {
      localStorage.setItem(CHECK_INS_KEY, JSON.stringify(checkIns));
    } catch {
      console.warn("Could not persist check-in history in local storage.");
    }
  }, [checkIns, checkInsLoaded]);

  useEffect(() => {
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  const handlePlacesLoaded = useCallback((items: VibePlace[]) => {
    setPlaces(items);
    if (sharedPlaceId.current) {
      const sharedPlace = items.find((item) => item.id === sharedPlaceId.current);
      if (sharedPlace) {
        setSelected(sharedPlace);
        sharedPlaceId.current = undefined;
      }
    }
  }, []);
  const handleWarnings = useCallback((items: string[]) => setWarnings(items), []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(undefined);
  }

  function begin() {
    setStarted(true);
    requestLocation();
    void requestHeading();
  }

  function createdAlert(place: VibePlace) {
    setCategoryOverride(place.category);
    setRefresh((value) => value + 1);
    selectPlace(place);
  }

  function selectPlace(place: VibePlace) {
    setSelected(place);
    setNavigationTarget(undefined);
    setSearchCenter(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("category", place.category);
    url.searchParams.set("placeId", place.id);
    window.history.replaceState(null, "", url);
  }

  function closePlace() {
    setSelected(undefined);
    setNavigationTarget(undefined);
    setSearchCenter(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete("placeId");
    url.searchParams.delete("category");
    window.history.replaceState(null, "", url);
  }

  function navigateTo(place: VibePlace) {
    setSelected(place);
    setNavigationTarget(place);
    setSearchCenter(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("category", place.category);
    url.searchParams.set("placeId", place.id);
    window.history.replaceState(null, "", url);
  }

  function showNearby(place: VibePlace) {
    setSearchCenter([place.lat, place.lng]);
    setNavigationTarget(undefined);
  }

  function updatePlaceTags(placeId: string, tags: string[], communityTags: string[]) {
    setPlaces((current) => current.map((place) => place.id === placeId
      ? { ...place, tags, communityTags }
      : place));
    setSelected((current) => current?.id === placeId
      ? { ...current, tags, communityTags }
      : current);
  }

  async function reportPlace(place: VibePlace, reason: "not_a_place" | "closed" | "incorrect") {
    const nextReportedIds = [...new Set([...reportedPlaceIds, place.id])];
    setReportedPlaceIds(nextReportedIds);
    setPlaces((current) => current.filter((item) => item.id !== place.id));
    try {
      localStorage.setItem(REPORTED_PLACES_KEY, JSON.stringify(nextReportedIds));
    } catch (error) {
      console.error("Could not persist local place suppression.", error);
    }
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: place.id,
          reason,
          lat: coordinates?.[0],
          lng: coordinates?.[1],
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not submit this report.");
      setCommunityStatus("REPORT SENT FOR TEAM REVIEW");
      window.setTimeout(() => setCommunityStatus(""), 5000);
      setSelected(undefined);
    } catch (error) {
      setReportedPlaceIds((ids) => ids.filter((id) => id !== place.id));
      try {
        localStorage.setItem(REPORTED_PLACES_KEY, JSON.stringify(reportedPlaceIds.filter((id) => id !== place.id)));
      } catch (storageError) {
        console.error("Could not restore local place visibility.", storageError);
      }
      throw error;
    }
  }

  function checkIn(place: VibePlace) {
    if (!coordinates || distanceInMeters(coordinates[0], coordinates[1], place.lat, place.lng) > 50) return;
    const checkedAt = new Date().toISOString();
    setCheckIns((previous) => {
      const next = [
        ...previous.filter((record) => !(record.placeId === place.id && localDateKey(new Date(record.checkedAt)) === localDateKey(new Date(checkedAt)))),
        { placeId: place.id, category: place.category, checkedAt },
      ].slice(-500);
      return next;
    });
  }

  const checkedToday = selected ? checkIns.some((record) =>
    record.placeId === selected.id &&
    localDateKey(new Date(record.checkedAt)) === localDateKey(new Date()),
  ) : false;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyCheckIns = checkIns.filter((record) => Date.parse(record.checkedAt) >= weekAgo);
  const uniqueWeeklyPlaces = new Set(weeklyCheckIns.map((record) => record.placeId)).size;
  const checkedDates = new Set(checkIns.map((record) => localDateKey(new Date(record.checkedAt))));
  let streak = 0;
  const cursor = new Date();
  if (!checkedDates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (checkedDates.has(localDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const badges = [
    ...(checkIns.length > 0 ? ["FIRST SIGNAL"] : []),
    ...(checkIns.some((record) => record.category === "PARTY") ? ["NIGHT OWL"] : []),
    ...(checkIns.some((record) => record.category === "EVENTS") ? ["EVENT EXPLORER"] : []),
    ...(checkIns.filter((record) => record.category === "FOODIE").length >= 5 ? ["CAMPUS FOODIE"] : []),
    ...(uniqueWeeklyPlaces >= 3 ? ["WEEKLY EXPLORER"] : []),
  ];

  return (
    <main className="app-shell">
      <VibeHeader
        category={category}
        onCategoryChange={(next) => { setCategoryOverride(next); closePlace(); }}
        onOpenProfile={() => setProfileOpen(true)}
        locationLabel={locationLabel}
      />
      <div className={`map-stage ${selected ? "map-stage--detail-open" : ""}`}>
        <MapCanvas
          category={category}
          selected={selected}
          navigationTarget={navigationTarget}
          searchCenter={searchCenter}
          onResetSearchCenter={() => setSearchCenter(undefined)}
          onExpandRadar={() => {
            if (profile.radiusKm < 10) updateProfile({ ...profile, radiusKm: 10 });
            else setRefresh((value) => value + 1);
          }}
          reportedPlaceIds={reportedPlaceIds}
          onSelect={selectPlace}
          onPlacesLoaded={handlePlacesLoaded}
          onWarnings={handleWarnings}
          refresh={refresh}
        />
        {coordinates && <div className="map-radius-tag">WITHIN {profile.radiusKm} KM</div>}
        {coordinates && <div className="explorer-stats" aria-live="polite">
          <strong>{streak} DAY STREAK</strong>
          <span>{badges.length} BADGES</span>
          <span>{uniqueWeeklyPlaces}/3 WEEKLY SPOTS</span>
          {badges.length > 0 && <span className="explorer-badges">{badges.join(" · ")}</span>}
        </div>}
        {coordinates && <button className="button button-alert" onClick={() => setAlertOpen(true)}>
          <span aria-hidden="true">+</span> DROP A SPOT
        </button>}
        {warnings.length > 0 && places.length > 0 && (
          <div className="api-warning" role="status">{warnings.join(" ")}</div>
        )}
        {navigationTarget && coordinates && (
          <div className="navigation-hud" role="status">
            <Navigation size={17} aria-hidden="true" />
            <span>WALKING TO {navigationTarget.title.toUpperCase()} · {Math.round(distanceInMeters(coordinates[0], coordinates[1], navigationTarget.lat, navigationTarget.lng))} METRES</span>
            <button
              className="navigation-hud-maps"
              onClick={() => window.open(
                `https://www.google.com/maps/dir/?api=1&origin=${coordinates[0]},${coordinates[1]}&destination=${navigationTarget.lat},${navigationTarget.lng}&travelmode=walking`,
                "_blank",
                "noopener,noreferrer",
              )}
            >
              OPEN MAPS
            </button>
            <button className="navigation-hud-close" aria-label="End navigation" onClick={() => setNavigationTarget(undefined)}>×</button>
          </div>
        )}
        {communityStatus && <div className="community-status" role="status">{communityStatus}</div>}
        <PlaceDetailPanel
          place={selected}
          onClose={closePlace}
          onNavigate={navigateTo}
          onNearby={showNearby}
          onTagAdded={updatePlaceTags}
          onTagRemoved={updatePlaceTags}
          onReport={reportPlace}
          userCoordinates={coordinates}
          onCheckIn={checkIn}
          checkedIn={checkedToday}
        />
      </div>
      {profileOpen && (
        <AnimatePresence>
          <ProfileModal
            key={`${profile.alias}-${profile.primaryVibe}-${profile.radiusKm}`}
            onClose={() => { setProfileOpen(false); setCategoryOverride(undefined); closePlace(); }}
          />
        </AnimatePresence>
      )}
      <AlertModal open={alertOpen} category={category} onClose={() => setAlertOpen(false)} onCreated={createdAlert} />
      <AnimatePresence>
        {!started && <SplashScreen onStart={begin} />}
      </AnimatePresence>
      {installPrompt && !selected && (
        <button className="install-app" onClick={installApp}>INSTALL FIND TONY</button>
      )}
      <PwaRegister />
      <span className="sr-only" aria-live="polite">{places.length} places in the selected radius.</span>
    </main>
  );
}

export default function HomePage() {
  return <VibeProvider><FindTonyApp /></VibeProvider>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
