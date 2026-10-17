export const EVENT_TAGS = [
  "Hackathon",
  "Case competition",
  "Startup event",
  "Technology meetup",
  "Workshop",
  "Conference",
  "Career fair",
  "Social event",
  "Community event",
] as const;

export function inferEventTags(title: string) {
  const text = title.toLowerCase();
  const tags: string[] = [];
  if (/\bcase\s*(?:competition|comp|challenge)\b/.test(text)) tags.push("Case competition");
  if (/\bhack(?:athon)?s?\b/.test(text)) tags.push("Hackathon");
  if (/\b(startup|founder|demo night|build(?:er)? day)\b/.test(text)) tags.push("Startup event");
  if (/\b(technology|tech|coding|software|developer|programming|ai|machine learning|robotics|data)\b/.test(text)) {
    tags.push("Technology meetup");
  }
  if (/\b(workshop|masterclass|bootcamp)\b/.test(text)) tags.push("Workshop");
  if (/\b(conference|summit|symposium)\b/.test(text)) tags.push("Conference");
  if (/\b(career fair|careers expo|graduate expo)\b/.test(text)) tags.push("Career fair");
  if (/\b(party|social|drinks|coffee|run club|running club|walk|yoga)\b/.test(text)) tags.push("Social event");
  return [...new Set(tags.length ? tags : ["Community event"])];
}
