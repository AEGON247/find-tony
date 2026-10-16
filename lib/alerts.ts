import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { VibePlace } from "@/lib/types";

const dataDirectory = process.env.DATA_DIR || "data";
const alertFile = path.join(dataDirectory, "alerts.json");
let writeQueue = Promise.resolve();

export async function readAlerts(): Promise<VibePlace[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(alertFile, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Persisted community alerts must be an array.");
    return parsed as VibePlace[];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveAlert(alert: VibePlace) {
  const write = writeQueue.then(async () => {
    await fs.mkdir(dataDirectory, { recursive: true });
    const alerts = await readAlerts();
    const temporaryFile = `${alertFile}.${process.pid}.${alert.id}.tmp`;
    try {
      await fs.writeFile(temporaryFile, `${JSON.stringify([...alerts, alert], null, 2)}\n`, "utf8");
      await fs.rename(temporaryFile, alertFile);
    } catch (error) {
      try {
        await fs.rm(temporaryFile, { force: true });
      } catch (cleanupError) {
        console.error("Could not remove temporary alert data.", cleanupError);
      }
      throw error;
    }
  });
  writeQueue = write.catch(() => undefined);
  await write;
}
