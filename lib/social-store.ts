import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { InvitePlace, InviteVibeId } from "@/lib/invite-vibes";
import {
  DEVICE_HEADER,
  DEVICE_ID_PATTERN,
  DEVICE_SECRET_PATTERN,
  type NotificationType,
  type ReportReason,
} from "@/lib/social-types";

// Open invites, vibe matching and chat share one JSON file so that a single
// queued write keeps invites, chat membership and notifications consistent.
// Like the other JSON stores, this is meant for a single app instance.

const dataDirectory = process.env.DATA_DIR || "data";
const socialFile = path.join(dataDirectory, "social.json");

export interface StoredUser {
  id: string;
  secretHash: string;
  alias: string;
  vibes: InviteVibeId[];
  bio: string;
  discoverable: boolean;
  adultConfirmedAt: string;
  createdAt: string;
  lastSeenAt: string;
  /** Rounded to ~1 km and only kept while the user is discoverable. */
  approxLat?: number;
  approxLng?: number;
  blocked: string[];
}

export interface StoredOpenInvite {
  id: string;
  hostId: string;
  place: InvitePlace;
  vibe: InviteVibeId;
  message: string;
  createdAt: string;
  expiresAt: string;
  endedAt?: string;
  spots: number;
  going: string[];
  chatId: string;
}

export interface StoredChat {
  id: string;
  kind: "invite" | "direct";
  inviteId?: string;
  memberIds: string[];
  readAt: Record<string, string>;
  createdAt: string;
  lastMessageAt: string;
}

export interface StoredMessage {
  id: string;
  chatId: string;
  /** null for system messages such as "Sam is in!". */
  senderId: string | null;
  text: string;
  createdAt: string;
}

export interface StoredConnection {
  fromId: string;
  toId: string;
  action: "connect" | "pass";
  createdAt: string;
}

export interface StoredNotification {
  id: string;
  userId: string;
  type: NotificationType;
  text: string;
  createdAt: string;
  read: boolean;
  chatId?: string;
  inviteId?: string;
}

export interface StoredReport {
  id: string;
  reporterId: string;
  targetId: string;
  chatId?: string;
  reason: ReportReason;
  details: string;
  createdAt: string;
}

export interface SocialData {
  users: StoredUser[];
  openInvites: StoredOpenInvite[];
  chats: StoredChat[];
  messages: StoredMessage[];
  connections: StoredConnection[];
  notifications: StoredNotification[];
  reports: StoredReport[];
}

export class SocialError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function emptySocialData(): SocialData {
  return { users: [], openInvites: [], chats: [], messages: [], connections: [], notifications: [], reports: [] };
}

async function readSocialFile(): Promise<SocialData> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(socialFile, "utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("Persisted social data must be an object.");
    const data = emptySocialData();
    for (const key of Object.keys(data) as (keyof SocialData)[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) (data[key] as unknown[]) = value;
    }
    return data;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return emptySocialData();
    throw error;
  }
}

async function writeSocialFile(data: SocialData) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${socialFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await fs.rename(temporaryFile, socialFile);
  } catch (error) {
    try {
      await fs.rm(temporaryFile, { force: true });
    } catch (cleanupError) {
      console.error("Could not remove temporary social data.", cleanupError);
    }
    throw error;
  }
}

// Route handlers can be bundled separately, so the queue lives on globalThis
// to make sure every route shares one writer.
const queueHolder = globalThis as typeof globalThis & { findTonySocialQueue?: Promise<void> };

/**
 * Runs `task` against the latest data and persists the result. Tasks set
 * `control.skipWrite` when they only read, so polling does not rewrite the file.
 */
export function updateSocial<T>(task: (data: SocialData, control: { skipWrite: boolean }) => T): Promise<T> {
  const run = (queueHolder.findTonySocialQueue ?? Promise.resolve()).then(async () => {
    const data = await readSocialFile();
    const control = { skipWrite: false };
    const result = task(data, control);
    if (!control.skipWrite) await writeSocialFile(data);
    return result;
  });
  queueHolder.findTonySocialQueue = run.then(() => undefined, () => undefined);
  return run;
}

export function createSocialId(length = 12) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}

export interface DeviceCredentials {
  id: string;
  secret: string;
}

export function credentialsFrom(request: Request): DeviceCredentials | undefined {
  const [id = "", secret = ""] = (request.headers.get(DEVICE_HEADER) ?? "").split(":");
  if (!DEVICE_ID_PATTERN.test(id) || !DEVICE_SECRET_PATTERN.test(secret)) return undefined;
  return { id, secret };
}

export function requireCredentials(request: Request): DeviceCredentials {
  const credentials = credentialsFrom(request);
  if (!credentials) throw new SocialError(401, "This device is missing its Find Tony ID. Reload the app and try again.");
  return credentials;
}

export function hashSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function secretMatches(user: StoredUser, secret: string) {
  const expected = Buffer.from(user.secretHash, "hex");
  const actual = Buffer.from(hashSecret(secret), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Returns the signed-in user, `undefined` if this device has no profile yet, and throws if the secret is wrong. */
export function findUser(data: SocialData, credentials?: DeviceCredentials) {
  if (!credentials) return undefined;
  const user = data.users.find((item) => item.id === credentials.id);
  if (!user) return undefined;
  if (!secretMatches(user, credentials.secret)) throw new SocialError(403, "This device could not be verified.");
  return user;
}

export function requireUser(data: SocialData, credentials: DeviceCredentials) {
  const user = findUser(data, credentials);
  if (!user) throw new SocialError(401, "Set up your social profile first.");
  return user;
}
