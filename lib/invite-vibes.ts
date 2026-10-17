import type { Category } from "@/lib/types";

export const INVITE_VIBE_IDS = [
  "FOOD_CRAWL",
  "COFFEE_CATCHUP",
  "LATE_NIGHT_EATS",
  "BIG_NIGHT_OUT",
  "CHILL_DRINKS",
  "HACKATHON_SQUAD",
  "MEETUP_BUDDIES",
  "STUDY_GRIND",
  "PICNIC_HANG",
] as const;

export type InviteVibeId = (typeof INVITE_VIBE_IDS)[number];

export interface InviteVibe {
  id: InviteVibeId;
  label: string;
  tagline: string;
  category: Category;
  color: string;
  accent: string;
}

export const INVITE_VIBES: Record<InviteVibeId, InviteVibe> = {
  FOOD_CRAWL: { id: "FOOD_CRAWL", label: "Food crawl", tagline: "Come hungry.", category: "FOODIE", color: "#ec4899", accent: "#facc15" },
  COFFEE_CATCHUP: { id: "COFFEE_CATCHUP", label: "Coffee catch-up", tagline: "Caffeine and gossip.", category: "FOODIE", color: "#f472b6", accent: "#fff" },
  LATE_NIGHT_EATS: { id: "LATE_NIGHT_EATS", label: "Late-night eats", tagline: "Kitchen's still open.", category: "FOODIE", color: "#db2777", accent: "#06b6d4" },
  BIG_NIGHT_OUT: { id: "BIG_NIGHT_OUT", label: "Big night out", tagline: "Wear the good shoes.", category: "PARTY", color: "#8b5cf6", accent: "#facc15" },
  CHILL_DRINKS: { id: "CHILL_DRINKS", label: "Chill drinks", tagline: "One drink. Maybe two.", category: "PARTY", color: "#7c3aed", accent: "#b7f36b" },
  HACKATHON_SQUAD: { id: "HACKATHON_SQUAD", label: "Hackathon squad", tagline: "Bring a laptop.", category: "EVENTS", color: "#06b6d4", accent: "#facc15" },
  MEETUP_BUDDIES: { id: "MEETUP_BUDDIES", label: "Meetup buddies", tagline: "Don't make me go alone.", category: "EVENTS", color: "#0891b2", accent: "#ec4899" },
  STUDY_GRIND: { id: "STUDY_GRIND", label: "Study grind", tagline: "Heads down, snacks out.", category: "CHILL", color: "#b7f36b", accent: "#8b5cf6" },
  PICNIC_HANG: { id: "PICNIC_HANG", label: "Picnic hang", tagline: "Blanket and good vibes.", category: "CHILL", color: "#a3e635", accent: "#ec4899" },
};

export function defaultVibeFor(category: Category): InviteVibeId {
  return INVITE_VIBE_IDS.find((id) => INVITE_VIBES[id].category === category) ?? "FOOD_CRAWL";
}

export interface InvitePlace {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  category: Category;
}

export interface Invite {
  id: string;
  place: InvitePlace;
  startsAt: string;
  message: string;
  vibe: InviteVibeId;
  hostName: string;
  createdAt: string;
  going: string[];
  declinedCount: number;
}

export const INVITE_ID_PATTERN = /^[a-z0-9]{10}$/;
// Find Tony is Sydney-only, so invite times are always shown in Sydney time,
// including in the server-rendered link preview image.
export const INVITE_TIME_ZONE = "Australia/Sydney";

export function formatInviteTime(iso: string) {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString("en-AU", { timeZone: INVITE_TIME_ZONE, weekday: "short", day: "numeric", month: "short" }),
    time: date.toLocaleTimeString("en-AU", { timeZone: INVITE_TIME_ZONE, hour: "numeric", minute: "2-digit" }),
  };
}
