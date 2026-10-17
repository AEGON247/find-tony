import type { Category } from "@/lib/types";

export interface BadgeDefinition {
  id: string;
  title: string;
  category: "ALCOHOLIC" | "NERD" | "RIZZY";
  description: string;
  iconPath: string;
  questTarget: number;
}

export interface BadgeCheckIn {
  placeId: string;
  category: Category;
  title?: string;
  address?: string;
  placeType?: string;
  lat?: number;
  lng?: number;
  tags?: string[];
}

export interface BadgeProgress {
  definition: BadgeDefinition;
  progress: number;
  unlocked: boolean;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "party-animal",
    title: "Party Animal",
    category: "ALCOHOLIC",
    description: "Check into 3 different party or pub spots around Randwick or Kingsford.",
    iconPath: "/badges/irishman.svg",
    questTarget: 3,
  },
  {
    id: "terminal-velocity",
    title: "Terminal Velocity",
    category: "NERD",
    description: "Check into 2 hackathon events, or check in at UNSW Main Library.",
    iconPath: "/badges/nerd.svg",
    questTarget: 2,
  },
  {
    id: "rizz-god",
    title: "Rizz God",
    category: "RIZZY",
    description: "Drop 2 community vibe spots, or check in at a late-night lounge.",
    iconPath: "/badges/social-bee.svg",
    questTarget: 2,
  },
];

export function getBadgeProgress(
  badge: BadgeDefinition,
  checkIns: BadgeCheckIn[],
  droppedSpotCount: number,
): number {
  if (badge.id === "party-animal") {
    const eligiblePlaces = new Set(checkIns
      .filter((checkIn) => {
        if (checkIn.category !== "PARTY") return false;
        const suburb = `${checkIn.address ?? ""} ${checkIn.title ?? ""}`;
        const inRandwickOrKingsford = /\b(randwick|kingsford)\b/i.test(suburb) ||
          (checkIn.lat !== undefined && checkIn.lng !== undefined &&
            checkIn.lat >= -33.96 && checkIn.lat <= -33.9 &&
            checkIn.lng >= 151.21 && checkIn.lng <= 151.27);
        return inRandwickOrKingsford;
      })
      .map((checkIn) => checkIn.placeId));
    return Math.min(badge.questTarget, eligiblePlaces.size);
  }

  if (badge.id === "terminal-velocity") {
    const qualifying = new Set<string>();
    let libraryCheckIn = false;
    for (const checkIn of checkIns) {
      const evidence = `${checkIn.title ?? ""} ${checkIn.placeType ?? ""} ${(checkIn.tags ?? []).join(" ")}`;
      if (checkIn.category === "EVENTS" && /\bhackathon\b/i.test(evidence)) {
        qualifying.add(checkIn.placeId);
      }
      if (checkIn.category === "CHILL" && /\b(library|unsw main library)\b/i.test(evidence)) {
        libraryCheckIn = true;
      }
    }
    return Math.min(badge.questTarget, Math.max(qualifying.size, libraryCheckIn ? badge.questTarget : 0));
  }

  const visitedLateNightLounge = checkIns.some((checkIn) =>
    checkIn.category === "PARTY" &&
    /\blounge\b/i.test(`${checkIn.title ?? ""} ${checkIn.placeType ?? ""} ${(checkIn.tags ?? []).join(" ")}`),
  );
  return Math.min(badge.questTarget, visitedLateNightLounge ? badge.questTarget : droppedSpotCount);
}

export function getBadgeSnapshot(
  checkIns: BadgeCheckIn[],
  droppedSpotCount: number,
  unlockedBadgeIds: string[],
): BadgeProgress[] {
  const unlocked = new Set(unlockedBadgeIds);
  return BADGE_DEFINITIONS.map((definition) => ({
    definition,
    progress: getBadgeProgress(definition, checkIns, droppedSpotCount),
    unlocked: unlocked.has(definition.id),
  }));
}
