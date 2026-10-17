"use client";

import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { Navigation } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AlertModal from "@/components/AlertModal";
import BadgeAwardOverlay from "@/components/BadgeAwardOverlay";
import BadgeProgressDrawer from "@/components/BadgeProgressDrawer";
import MapLoader from "@/components/MapLoader";
import PlaceDetailPanel from "@/components/PlaceDetailPanel";
import ProfileModal from "@/components/ProfileModal";
import SplashScreen from "@/components/SplashScreen";
import VibeHeader from "@/components/VibeHeader";
import { VibeProvider, useVibe } from "@/context/VibeContext";
import type { Category, VibePlace } from "@/lib/types";
import PwaRegister from "@/components/PwaRegister";
import { distanceInMeters } from "@/lib/geo";
import { BADGE_DEFINITIONS, getBadgeSnapshot, type BadgeCheckIn, type BadgeDefinition } from "@/config/badges";
import { CATEGORIES } from "@/lib/types";

interface CheckInRecord extends BadgeCheckIn {
  checkedAt: string;
}
interface UserStats {
  checkIns: CheckInRecord[];
  droppedSpotCount: number;
  unlockedBadgeIds: string[];
}

const USER_STATS_KEY = "vibe_radar_user_stats";
const LEGACY_CHECK_INS_KEY = "find-tony-check-ins-v1";
const REPORTED_PLACES_KEY = "find-tony-reported-places-v1";
const EMPTY_USER_STATS: UserStats = { checkIns: [], droppedSpotCount: 0, unlockedBadgeIds: [] };

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeCheckIns(value: unknown): CheckInRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((record): CheckInRecord[] => {
    if (
      !record ||
      typeof record !== "object" ||
      typeof (record as Record<string, unknown>).placeId !== "string" ||
      typeof (record as Record<string, unknown>).checkedAt !== "string" ||
      !Number.isFinite(Date.parse((record as Record<string, unknown>).checkedAt as string))
    ) return [];
    const checkIn = record as Record<string, unknown>;
    const category = checkIn.category === "HACKATHONS"
      ? "EVENTS"
      : checkIn.category;
    if (!CATEGORIES.includes(category as Category)) return [];
    return [{
      placeId: checkIn.placeId as string,
      category: category as Category,
      checkedAt: checkIn.checkedAt as string,
      ...(typeof checkIn.title === "string" ? { title: checkIn.title } : {}),
      ...(typeof checkIn.address === "string" ? { address: checkIn.address } : {}),
      ...(typeof checkIn.placeType === "string" ? { placeType: checkIn.placeType } : {}),
      ...(typeof checkIn.lat === "number" && Number.isFinite(checkIn.lat) ? { lat: checkIn.lat } : {}),
      ...(typeof checkIn.lng === "number" && Number.isFinite(checkIn.lng) ? { lng: checkIn.lng } : {}),
      ...(Array.isArray(checkIn.tags)
        ? { tags: checkIn.tags.filter((tag: unknown): tag is string => typeof tag === "string") }
        : {}),
    }];
  });
}

function normalizeUserStats(value: unknown): UserStats | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return {
    checkIns: normalizeCheckIns(record.checkIns),
    droppedSpotCount: typeof record.droppedSpotCount === "number" && Number.isFinite(record.droppedSpotCount)
      ? Math.max(0, Math.floor(record.droppedSpotCount))
      : 0,
    unlockedBadgeIds: Array.isArray(record.unlockedBadgeIds)
      ? [...new Set(record.unlockedBadgeIds.filter(
        (id: unknown): id is string => typeof id === "string" && BADGE_DEFINITIONS.some((badge) => badge.id === id),
      ))]
      : [],
  };
}

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => <div className="map-loading"><MapLoader label="LOADING SYDNEY MAP..." /></div>,
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
  const [places, setPlaces] = useState<VibePlace[]>([]);
  const [reportedPlaceIds, setReportedPlaceIds] = useState<string[]>([]);
  const [communityStatus, setCommunityStatus] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent>();
  const [userStats, setUserStats] = useState<UserStats>(EMPTY_USER_STATS);
  const [userStatsLoaded, setUserStatsLoaded] = useState(false);
  const [badgeNotifications, setBadgeNotifications] = useState<BadgeDefinition[]>([]);
  const [badgeProgressOpen, setBadgeProgressOpen] = useState(false);
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
      const savedStats = localStorage.getItem(USER_STATS_KEY);
      const savedLegacyCheckIns = localStorage.getItem(LEGACY_CHECK_INS_KEY);
      const legacyCheckIns = savedLegacyCheckIns
        ? normalizeCheckIns(JSON.parse(savedLegacyCheckIns))
        : [];
      const storedStats = savedStats ? normalizeUserStats(JSON.parse(savedStats)) : undefined;
      setUserStats(storedStats ?? { ...EMPTY_USER_STATS, checkIns: legacyCheckIns });
    } catch (error) {
      console.error("Could not load local Vibe Radar stats.", error);
      setUserStats(EMPTY_USER_STATS);
    } finally {
      setUserStatsLoaded(true);
    }
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
    if (!userStatsLoaded) return;
    try {
      localStorage.setItem(USER_STATS_KEY, JSON.stringify(userStats));
      localStorage.setItem(LEGACY_CHECK_INS_KEY, JSON.stringify(userStats.checkIns));
    } catch (error) {
      console.error("Could not persist Vibe Radar stats.", error);
    }
  }, [userStats, userStatsLoaded]);

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

  useEffect(() => {
    const selectedId = selected?.id;
    if (!selected || !selectedId?.startsWith("foursquare-") || selected.imageUrls?.length || selected.imageUrl) return;
    const placeId = selectedId.slice("foursquare-".length);
    const controller = new AbortController();
    fetch(`/api/places/${encodeURIComponent(placeId)}/photos`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { photos?: string[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? `Could not load venue photos (${response.status}).`);
        return result.photos ?? [];
      })
      .then((photos) => {
        const imageUrls = photos.filter((url) => /^https:\/\/\S+$/i.test(url));
        if (imageUrls.length === 0) return;
        setPlaces((current) => current.map((place) => place.id === selectedId
          ? { ...place, imageUrls, imageUrl: imageUrls[0] }
          : place));
        setSelected((current) => current?.id === selectedId
          ? { ...current, imageUrls, imageUrl: imageUrls[0] }
          : current);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Could not load Foursquare venue photos.", error);
      });
    return () => controller.abort();
  }, [selected]);

  useEffect(() => {
    if (!userStatsLoaded) return;
    const newlyEarned = getBadgeSnapshot(
      userStats.checkIns,
      userStats.droppedSpotCount,
      userStats.unlockedBadgeIds,
    ).filter((badge) => !badge.unlocked && badge.progress >= badge.definition.questTarget);
    if (newlyEarned.length === 0) return;

    const newBadgeIds = newlyEarned.map(({ definition }) => definition.id);
    setUserStats((current) => ({
      ...current,
      unlockedBadgeIds: [...new Set([...current.unlockedBadgeIds, ...newBadgeIds])],
    }));
    setBadgeNotifications((current) => {
      const queuedIds = new Set(current.map((badge) => badge.id));
      return [...current, ...newlyEarned
        .map(({ definition }) => definition)
        .filter((badge) => !queuedIds.has(badge.id))];
    });
  }, [userStats, userStatsLoaded]);

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
    setUserStats((current) => ({ ...current, droppedSpotCount: current.droppedSpotCount + 1 }));
    setCategoryOverride(place.category);
    setRefresh((value) => value + 1);
    selectPlace(place);
  }

  function selectPlace(place: VibePlace) {
    setSelected(place);
    setNavigationTarget(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("category", place.category);
    url.searchParams.set("placeId", place.id);
    window.history.replaceState(null, "", url);
  }

  function closePlace() {
    setSelected(undefined);
    setNavigationTarget(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete("placeId");
    url.searchParams.delete("category");
    window.history.replaceState(null, "", url);
  }

  function navigateTo(place: VibePlace) {
    setSelected(place);
    setNavigationTarget(place);
    const url = new URL(window.location.href);
    url.searchParams.set("category", place.category);
    url.searchParams.set("placeId", place.id);
    window.history.replaceState(null, "", url);
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
    setUserStats((current) => {
      if (current.checkIns.some((record) =>
        record.placeId === place.id &&
        localDateKey(new Date(record.checkedAt)) === localDateKey(new Date(checkedAt)),
      )) return current;
      const checkIn: CheckInRecord = {
        placeId: place.id,
        category: place.category,
        checkedAt,
        title: place.title,
        address: place.address,
        placeType: place.placeType,
        lat: place.lat,
        lng: place.lng,
        tags: place.tags ?? [],
      };
      return { ...current, checkIns: [...current.checkIns, checkIn].slice(-2000) };
    });
  }

  const checkIns = userStats.checkIns;
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
  const badgeProgress = getBadgeSnapshot(checkIns, userStats.droppedSpotCount, userStats.unlockedBadgeIds);
  const earnedBadges = badgeProgress.filter((badge) => badge.unlocked);

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
        {coordinates && <button
          className="explorer-stats"
          type="button"
          aria-label={`Open badge quests. ${streak} day streak, ${earnedBadges.length} badges earned, ${uniqueWeeklyPlaces} weekly places.`}
          aria-haspopup="dialog"
          onClick={() => setBadgeProgressOpen(true)}
        >
          <strong>{streak} DAY STREAK</strong>
          <span>{earnedBadges.length} BADGES</span>
          <span>{uniqueWeeklyPlaces}/3 WEEKLY SPOTS</span>
          {earnedBadges.length > 0 && <span className="explorer-badges">{earnedBadges.map((badge) => badge.definition.title.toUpperCase()).join(" · ")}</span>}
        </button>}
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
            badges={earnedBadges}
          />
        </AnimatePresence>
      )}
      <BadgeProgressDrawer
        open={badgeProgressOpen}
        badges={badgeProgress}
        onClose={() => setBadgeProgressOpen(false)}
      />
      <AlertModal open={alertOpen} category={category} onClose={() => setAlertOpen(false)} onCreated={createdAlert} />
      <AnimatePresence>
        {!started && <SplashScreen onStart={begin} />}
      </AnimatePresence>
      {installPrompt && !selected && (
        <button className="install-app" onClick={installApp}>INSTALL FIND TONY</button>
      )}
      <PwaRegister />
      <BadgeAwardOverlay
        badge={badgeNotifications[0]}
        onClose={() => setBadgeNotifications((current) => current.slice(1))}
      />
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
