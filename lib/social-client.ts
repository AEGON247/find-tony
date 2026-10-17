"use client";

import { DEVICE_HEADER, DEVICE_ID_PATTERN, DEVICE_SECRET_PATTERN } from "@/lib/social-types";

// Find Tony has no accounts. Each browser gets a random ID plus a secret that
// only this device knows; the server stores a hash of the secret, so nobody
// else can post or read chats as you. Clearing site data starts a new identity.

const DEVICE_KEY = "find-tony-device-v1";
let memoryCredentials: string | undefined;

function randomString(length: number) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  // 252 is the largest multiple of 36 below 256, so rejecting higher bytes keeps every character equally likely.
  const characters: string[] = [];
  while (characters.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < 252 && characters.length < length) characters.push(alphabet[byte % 36]);
    }
  }
  return characters.join("");
}

function deviceCredentials() {
  if (memoryCredentials) return memoryCredentials;
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    const [id = "", secret = ""] = (stored ?? "").split(":");
    if (DEVICE_ID_PATTERN.test(id) && DEVICE_SECRET_PATTERN.test(secret)) {
      memoryCredentials = stored!;
      return memoryCredentials;
    }
  } catch {
    // Storage can be blocked (private mode); fall back to an in-memory identity.
  }
  memoryCredentials = `${randomString(16)}:${randomString(32)}`;
  try {
    localStorage.setItem(DEVICE_KEY, memoryCredentials);
  } catch {
    console.warn("Could not save this device's Find Tony ID; chats will reset when the page reloads.");
  }
  return memoryCredentials;
}

export function deviceId() {
  return deviceCredentials().split(":")[0];
}

export async function socialFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    headers: {
      ...(json === undefined ? {} : { "Content-Type": "application/json" }),
      [DEVICE_HEADER]: deviceCredentials(),
      ...headers,
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body;
}

const HIDDEN_INVITES_KEY = "find-tony-hidden-open-invites-v1";

/** Invites this person said "not for me" to. Kept on the device only so hosts never learn who passed. */
export function readHiddenInviteIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HIDDEN_INVITES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveHiddenInviteIds(ids: string[]) {
  try {
    localStorage.setItem(HIDDEN_INVITES_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    console.warn("Could not remember hidden invites on this device.");
  }
}
