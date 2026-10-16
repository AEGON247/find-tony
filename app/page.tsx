"use client";

import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
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

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => <div className="map-loading">LOADING SYDNEY MAP...</div>,
});

function FindTonyApp() {
  const {
    profile, coordinates, locationLabel, requestLocation, requestHeading,
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
    if (sharedCategory && ["FOODIE", "PARTY", "HACKATHONS", "CHILL"].includes(sharedCategory)) {
      setCategoryOverride(sharedCategory as Category);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHECK_INS_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCheckIns(parsed.filter((record): record is CheckInRecord =>
            typeof record?.placeId === "string" &&
            ["FOODIE", "PARTY", "HACKATHONS", "CHILL"].includes(record.category) &&
            typeof record.checkedAt === "string" &&
            Number.isFinite(Date.parse(record.checkedAt)),
          ));
        }
      }
    } catch {
      console.warn("Could not load local check-in history.");
    }
    setCheckInsLoaded(true);
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
    ...(checkIns.some((record) => record.category === "HACKATHONS") ? ["HACKATHON RUNNER"] : []),
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
        {warnings.length > 0 && (
          <div className="api-warning" role="status">{warnings.join(" ")}</div>
        )}
        <PlaceDetailPanel
          place={selected}
          onClose={closePlace}
          onNavigate={navigateTo}
          onNearby={showNearby}
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
