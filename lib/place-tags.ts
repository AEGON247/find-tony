import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

const dataDirectory = process.env.DATA_DIR || "data";
const tagsFile = path.join(dataDirectory, "place-tags.json");
type PlaceTags = Record<string, string[]>;
let writeQueue: Promise<void> = Promise.resolve();

async function readAllTags(): Promise<PlaceTags> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(tagsFile, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Persisted place tags must be a record.");
    }
    const entries = Object.entries(parsed);
    if (entries.some(([placeId, tags]) =>
      !placeId ||
      !Array.isArray(tags) ||
      tags.some((tag) => typeof tag !== "string"),
    )) {
      throw new Error("Persisted place-tag records have an invalid shape.");
    }
    return Object.fromEntries(entries) as PlaceTags;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

export async function readPlaceTags(): Promise<PlaceTags> {
  return readAllTags();
}

export async function addPlaceTag(placeId: string, tag: string) {
  const write = writeQueue.then(async () => {
    await fs.mkdir(dataDirectory, { recursive: true });
    const tags = await readAllTags();
    const existing = tags[placeId] ?? [];
    const normalized = tag.toLocaleLowerCase("en-AU");
    if (existing.some((value) => value.toLocaleLowerCase("en-AU") === normalized)) return existing;
    if (existing.length >= 12) throw new Error("A place can have at most 12 community tags.");
    const updated = [...existing, tag];
    const next = { ...tags, [placeId]: updated };
    const temporaryFile = `${tagsFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      await fs.rename(temporaryFile, tagsFile);
    } catch (error) {
      try {
        await fs.rm(temporaryFile, { force: true });
      } catch (cleanupError) {
        console.error("Could not remove temporary place-tag data.", cleanupError);
      }
      throw error;
    }
    return updated;
  });
  writeQueue = write.then(() => undefined, () => undefined);
  return write;
}

export async function removePlaceTag(placeId: string, tag: string) {
  const write = writeQueue.then(async () => {
    await fs.mkdir(dataDirectory, { recursive: true });
    const tags = await readAllTags();
    const existing = tags[placeId] ?? [];
    const normalized = tag.toLocaleLowerCase("en-AU");
    const updated = existing.filter((value) => value.toLocaleLowerCase("en-AU") !== normalized);
    if (updated.length === existing.length) return existing;

    const next = { ...tags };
    if (updated.length > 0) next[placeId] = updated;
    else delete next[placeId];
    const temporaryFile = `${tagsFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      await fs.rename(temporaryFile, tagsFile);
    } catch (error) {
      try {
        await fs.rm(temporaryFile, { force: true });
      } catch (cleanupError) {
        console.error("Could not remove temporary place-tag data.", cleanupError);
      }
      throw error;
    }
    return updated;
  });
  writeQueue = write.then(() => undefined, () => undefined);
  return write;
}
