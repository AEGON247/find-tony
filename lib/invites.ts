import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { INVITE_ID_PATTERN, type Invite } from "@/lib/invite-vibes";

const dataDirectory = process.env.DATA_DIR || "data";
const invitesFile = path.join(dataDirectory, "invites.json");
let writeQueue: Promise<void> = Promise.resolve();

async function readInvites(): Promise<Invite[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(invitesFile, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Persisted invites must be an array.");
    return parsed as Invite[];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeInvites(invites: Invite[], tag: string) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${invitesFile}.${process.pid}.${tag}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${JSON.stringify(invites, null, 2)}\n`, "utf8");
    await fs.rename(temporaryFile, invitesFile);
  } catch (error) {
    try {
      await fs.rm(temporaryFile, { force: true });
    } catch (cleanupError) {
      console.error("Could not remove temporary invite data.", cleanupError);
    }
    throw error;
  }
}

function queued<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task);
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

export function createInviteId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function getInvite(id: string): Promise<Invite | undefined> {
  if (!INVITE_ID_PATTERN.test(id)) return undefined;
  return (await readInvites()).find((invite) => invite.id === id);
}

export function saveInvite(invite: Invite) {
  return queued(async () => {
    const invites = await readInvites();
    await writeInvites([...invites, invite], invite.id);
  });
}

export function respondToInvite(id: string, response: "accept" | "decline", name: string) {
  return queued(async () => {
    const invites = await readInvites();
    const invite = invites.find((item) => item.id === id);
    if (!invite) return undefined;
    if (response === "accept") {
      invite.going = [...invite.going, name || "A friend"].slice(-100);
    } else {
      invite.declinedCount += 1;
    }
    await writeInvites(invites, `${id}-${Date.now()}`);
    return invite;
  });
}
