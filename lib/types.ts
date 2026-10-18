export const CATEGORIES = ["FOODIE", "PARTY", "EVENTS", "CHILL"] as const;

export type Category = (typeof CATEGORIES)[number];

export interface EventDetails {
  activeEvent?: string;
  time?: string;
  prizes?: string;
  foodProvided?: boolean;
  registrationStatus?: string;
  deal?: string;
  hours?: string;
  status?: string;
  entry?: string;
  floor?: string;
}

export interface VibePlace {
  id: string;
  title: string;
  category: Category;
  lat: number;
  lng: number;
  address: string;
  details: string;
  tags?: string[];
  sourceTags?: string[];
  communityTags?: string[];
  placeType?: string;
  accessibility?: string;
  imageUrl?: string;
  imageUrls?: string[];
  rating?: number;
  source: string;
  link?: string;
  eventDetails?: EventDetails;
  distanceMeters?: number;
  isLiveEvent?: boolean;
  eventStart?: string;
  eventEnd?: string;
  isFree?: boolean;
  isMapPoi?: boolean;
  expiresAt?: string | null;
}

export interface UserProfile {
  alias: string;
  primaryVibe: Category;
  radiusKm: number;
}

export interface VibesResponse {
  items: VibePlace[];
  warnings: string[];
  source?: "stale_cache";
}
