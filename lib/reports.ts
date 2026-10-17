import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

export interface PlaceReport {
  id: string;
  placeId: string;
  reason: "not_a_place" | "closed" | "incorrect";
  reportedAt: string;
  userCoordinates?: [number, number];
}

const dataDirectory = process.env.DATA_DIR || "data";
const reportsFile = path.join(dataDirectory, "reports.json");
let writeQueue: Promise<void> = Promise.resolve();

async function readReports(): Promise<PlaceReport[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(reportsFile, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Persisted place reports must be an array.");
    return parsed as PlaceReport[];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function savePlaceReport(report: PlaceReport) {
  const write = writeQueue.then(async () => {
    await fs.mkdir(dataDirectory, { recursive: true });
    const reports = await readReports();
    const temporaryFile = `${reportsFile}.${process.pid}.${report.id}.tmp`;
    try {
      await fs.writeFile(temporaryFile, `${JSON.stringify([...reports, report], null, 2)}\n`, "utf8");
      await fs.rename(temporaryFile, reportsFile);
    } catch (error) {
      try {
        await fs.rm(temporaryFile, { force: true });
      } catch (cleanupError) {
        console.error("Could not remove temporary place-report data.", cleanupError);
      }
      throw error;
    }
  });
  writeQueue = write.then(() => undefined, () => undefined);
  await write;
}
