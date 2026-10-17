import "server-only";
import { distanceInMeters, isSydneyCoordinate } from "@/lib/geo";
import { INVITE_VIBES, INVITE_VIBE_IDS, formatInviteTime, type InvitePlace, type InviteVibeId } from "@/lib/invite-vibes";
import {
  MAX_MESSAGE_LENGTH,
  MAX_SOCIAL_VIBES,
  OPEN_INVITE_DURATIONS,
  OPEN_INVITE_SPOTS,
  REPORT_REASONS,
  type ChatDetail,
  type ChatMessage,
  type ChatSummary,
  type MatchCandidate,
  type NotificationType,
  type OpenInviteView,
  type PublicUser,
  type ReportReason,
  type SocialProfile,
  type SyncResponse,
} from "@/lib/social-types";
import {
  SocialError,
  createSocialId,
  findUser,
  hashSecret,
  requireUser,
  updateSocial,
  type DeviceCredentials,
  type SocialData,
  type StoredChat,
  type StoredOpenInvite,
  type StoredUser,
} from "@/lib/social-store";
import { CATEGORIES, type Category } from "@/lib/types";

const MINUTE = 60 * 1000;
const ACTIVE_USER_WINDOW_MS = 7 * 24 * 60 * MINUTE;
/** Invite group chats stay open this long after the pin leaves the map, so people can still meet up. */
const CHAT_GRACE_MS = 12 * 60 * MINUTE;
const MAX_ACTIVE_INVITES_PER_HOST = 2;
const MESSAGES_PER_CHAT = 300;
const NOTIFICATIONS_PER_USER = 100;
const LAST_SEEN_RESOLUTION_MS = MINUTE;

type Coordinates = { lat: number; lng: number };

function roundToKilometre(value: number) {
  return Math.round(value * 100) / 100;
}

function publicUser(user: StoredUser): PublicUser {
  return { id: user.id, alias: user.alias, vibes: user.vibes, bio: user.bio };
}

function profileOf(user: StoredUser): SocialProfile {
  return { ...publicUser(user), discoverable: user.discoverable };
}

function userById(data: SocialData, id: string) {
  return data.users.find((user) => user.id === id);
}

function aliasOf(data: SocialData, id: string | null) {
  if (!id) return "Find Tony";
  return userById(data, id)?.alias ?? "Someone";
}

function isBlockedBetween(data: SocialData, firstId: string, secondId: string) {
  return Boolean(
    userById(data, firstId)?.blocked.includes(secondId) ||
    userById(data, secondId)?.blocked.includes(firstId),
  );
}

function inviteEndTime(invite: StoredOpenInvite) {
  return Math.min(Date.parse(invite.expiresAt), invite.endedAt ? Date.parse(invite.endedAt) : Infinity);
}

function isActiveInvite(invite: StoredOpenInvite, now: number) {
  return inviteEndTime(invite) > now;
}

function vibeLabel(vibe: InviteVibeId) {
  return INVITE_VIBES[vibe].label;
}

function pushNotification(
  data: SocialData,
  userId: string,
  type: NotificationType,
  text: string,
  links: { chatId?: string; inviteId?: string } = {},
) {
  data.notifications.push({
    id: createSocialId(),
    userId,
    type,
    text,
    createdAt: new Date().toISOString(),
    read: false,
    ...links,
  });
  const mine = data.notifications.filter((item) => item.userId === userId);
  if (mine.length > NOTIFICATIONS_PER_USER) {
    const drop = new Set(mine.slice(0, mine.length - NOTIFICATIONS_PER_USER).map((item) => item.id));
    data.notifications = data.notifications.filter((item) => !drop.has(item.id));
  }
}

function pushMessage(data: SocialData, chat: StoredChat, senderId: string | null, text: string) {
  const createdAt = new Date().toISOString();
  const message = { id: createSocialId(), chatId: chat.id, senderId, text, createdAt };
  data.messages.push(message);
  chat.lastMessageAt = createdAt;
  if (senderId) chat.readAt[senderId] = createdAt;
  const inChat = data.messages.filter((item) => item.chatId === chat.id);
  if (inChat.length > MESSAGES_PER_CHAT) {
    const drop = new Set(inChat.slice(0, inChat.length - MESSAGES_PER_CHAT).map((item) => item.id));
    data.messages = data.messages.filter((item) => !drop.has(item.id));
  }
  return message;
}

function chatSummary(data: SocialData, chat: StoredChat, viewer: StoredUser, now: number): ChatSummary {
  const messages = data.messages.filter((item) =>
    item.chatId === chat.id && !(item.senderId && viewer.blocked.includes(item.senderId)));
  const lastRead = Date.parse(chat.readAt[viewer.id] ?? "") || 0;
  // Only messages people wrote count as unread; automatic lines like "sam is in!"
  // already arrive as notifications and would otherwise be counted twice.
  const unread = messages.filter((item) =>
    item.senderId !== null && item.senderId !== viewer.id && Date.parse(item.createdAt) > lastRead).length;
  const last = messages.at(-1);
  const base = {
    id: chat.id,
    kind: chat.kind,
    unread,
    lastMessageAt: chat.lastMessageAt,
    ...(last ? { lastMessage: { text: last.text, senderAlias: aliasOf(data, last.senderId), createdAt: last.createdAt } } : {}),
  };
  if (chat.kind === "invite") {
    const invite = data.openInvites.find((item) => item.id === chat.inviteId);
    const live = invite ? isActiveInvite(invite, now) : false;
    return {
      ...base,
      title: invite ? `${vibeLabel(invite.vibe)} @ ${invite.place.title}` : "Open invite",
      subtitle: !invite
        ? "Invite removed"
        : live
          ? `Live until ${formatInviteTime(invite.expiresAt).time} · ${invite.going.length} going`
          : "Invite ended",
      inviteId: chat.inviteId,
      active: invite ? inviteEndTime(invite) + CHAT_GRACE_MS > now : false,
    };
  }
  const otherId = chat.memberIds.find((id) => id !== viewer.id) ?? "";
  return {
    ...base,
    title: aliasOf(data, otherId),
    subtitle: "Direct message",
    otherUserId: otherId,
    active: !isBlockedBetween(data, viewer.id, otherId),
  };
}

function openInviteView(data: SocialData, invite: StoredOpenInvite, viewer?: StoredUser): OpenInviteView {
  const isMine = viewer?.id === invite.hostId;
  const amGoing = Boolean(viewer && invite.going.includes(viewer.id));
  const isMember = isMine || amGoing;
  return {
    id: invite.id,
    place: invite.place,
    vibe: invite.vibe,
    message: invite.message,
    hostId: invite.hostId,
    hostAlias: aliasOf(data, invite.hostId),
    hostBio: userById(data, invite.hostId)?.bio ?? "",
    hostVibes: userById(data, invite.hostId)?.vibes ?? [],
    createdAt: invite.createdAt,
    expiresAt: new Date(inviteEndTime(invite)).toISOString(),
    spots: invite.spots,
    goingCount: invite.going.length,
    isMine,
    amGoing,
    ...(isMember ? {
      chatId: invite.chatId,
      going: invite.going.flatMap((id) => {
        const user = userById(data, id);
        return user ? [publicUser(user)] : [];
      }),
    } : {}),
  };
}

function parseVibes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is InviteVibeId =>
    typeof item === "string" && INVITE_VIBE_IDS.includes(item as InviteVibeId)))];
}

export function saveSocialProfile(credentials: DeviceCredentials, input: Record<string, unknown>) {
  const alias = typeof input.alias === "string" ? input.alias.trim() : "";
  const bio = typeof input.bio === "string" ? input.bio.trim() : "";
  const vibes = parseVibes(input.vibes);
  if (alias.length < 2 || alias.length > 32) throw new SocialError(400, "Pick a handle between 2 and 32 characters.");
  if (vibes.length === 0 || vibes.length > MAX_SOCIAL_VIBES) throw new SocialError(400, `Pick between 1 and ${MAX_SOCIAL_VIBES} vibes.`);
  if (bio.length > 140) throw new SocialError(400, "Keep your bio to 140 characters or fewer.");
  if (input.adultConfirmed !== true) throw new SocialError(400, "You must be 18 or older to use open invites and matching.");

  return updateSocial((data) => {
    const now = new Date().toISOString();
    let user = findUser(data, credentials);
    // Handles are unique (ignoring case) so nobody can pass as someone else in a chat.
    if (data.users.some((item) => item.id !== credentials.id && item.alias.toLowerCase() === alias.toLowerCase())) {
      throw new SocialError(409, `The handle "${alias}" is taken. Try another one.`);
    }
    if (!user) {
      user = {
        id: credentials.id,
        secretHash: hashSecret(credentials.secret),
        alias,
        vibes,
        bio,
        discoverable: true,
        adultConfirmedAt: now,
        createdAt: now,
        lastSeenAt: now,
        blocked: [],
      };
      data.users.push(user);
    }
    user.alias = alias;
    user.vibes = vibes;
    user.bio = bio;
    user.discoverable = input.discoverable !== false;
    if (!user.discoverable) {
      delete user.approxLat;
      delete user.approxLng;
    }
    user.lastSeenAt = now;
    return profileOf(user);
  });
}

export function syncSocial(credentials: DeviceCredentials | undefined, coordinates?: Coordinates) {
  return updateSocial((data, control): SyncResponse => {
    const user = findUser(data, credentials);
    if (!user) {
      control.skipWrite = true;
      return { profile: null, notifications: [], chats: [], unreadMessages: 0 };
    }
    const now = Date.now();
    let changed = false;
    if (now - Date.parse(user.lastSeenAt) > LAST_SEEN_RESOLUTION_MS) {
      user.lastSeenAt = new Date(now).toISOString();
      changed = true;
    }
    if (user.discoverable && coordinates) {
      const lat = roundToKilometre(coordinates.lat);
      const lng = roundToKilometre(coordinates.lng);
      if (lat !== user.approxLat || lng !== user.approxLng) {
        user.approxLat = lat;
        user.approxLng = lng;
        changed = true;
      }
    }
    control.skipWrite = !changed;
    const chats = data.chats
      .filter((chat) => chat.memberIds.includes(user.id))
      .map((chat) => chatSummary(data, chat, user, now))
      .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
    return {
      profile: profileOf(user),
      notifications: data.notifications
        .filter((item) => item.userId === user.id)
        .slice(-30)
        .reverse()
        .map(({ id, type, text, createdAt, read, chatId, inviteId }) => ({ id, type, text, createdAt, read, chatId, inviteId })),
      chats,
      unreadMessages: chats.reduce((total, chat) => total + chat.unread, 0),
    };
  });
}

export function markNotificationsRead(credentials: DeviceCredentials, ids: string[] | "all") {
  return updateSocial((data) => {
    const user = requireUser(data, credentials);
    for (const item of data.notifications) {
      if (item.userId === user.id && (ids === "all" || ids.includes(item.id))) item.read = true;
    }
    return { ok: true };
  });
}

export function listOpenInvites(credentials: DeviceCredentials | undefined, center: Coordinates, radiusKm: number) {
  return updateSocial((data, control) => {
    control.skipWrite = true;
    const viewer = findUser(data, credentials);
    const now = Date.now();
    return data.openInvites
      .filter((invite) => isActiveInvite(invite, now))
      .filter((invite) => !viewer || !isBlockedBetween(data, viewer.id, invite.hostId))
      .filter((invite) =>
        invite.hostId === viewer?.id ||
        (viewer && invite.going.includes(viewer.id)) ||
        distanceInMeters(center.lat, center.lng, invite.place.lat, invite.place.lng) <= radiusKm * 1000)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((invite) => openInviteView(data, invite, viewer));
  });
}

function parsePlace(value: unknown): InvitePlace {
  const place = value as Record<string, unknown> | undefined;
  if (
    !place ||
    typeof place.id !== "string" || place.id.length > 200 ||
    typeof place.title !== "string" || !place.title.trim() || place.title.length > 120 ||
    typeof place.lat !== "number" || typeof place.lng !== "number" ||
    !isSydneyCoordinate(place.lat, place.lng) ||
    typeof place.category !== "string" || !CATEGORIES.includes(place.category as Category)
  ) {
    throw new SocialError(400, "Pick a Sydney venue from the map.");
  }
  return {
    id: place.id,
    title: place.title.trim(),
    address: typeof place.address === "string" ? place.address.slice(0, 200) : "",
    lat: place.lat,
    lng: place.lng,
    category: place.category as Category,
  };
}

export function createOpenInvite(credentials: DeviceCredentials, input: Record<string, unknown>) {
  const place = parsePlace(input.place);
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const durationMinutes = Number(input.durationMinutes);
  const spots = Number(input.spots ?? 0);
  if (typeof input.vibe !== "string" || !INVITE_VIBE_IDS.includes(input.vibe as InviteVibeId)) {
    throw new SocialError(400, "Choose a vibe for the invite.");
  }
  if (message.length > 160) throw new SocialError(400, "Keep the message to 160 characters or fewer.");
  if (!OPEN_INVITE_DURATIONS.includes(durationMinutes as (typeof OPEN_INVITE_DURATIONS)[number])) {
    throw new SocialError(400, "Choose how long the invite stays live.");
  }
  if (!OPEN_INVITE_SPOTS.includes(spots as (typeof OPEN_INVITE_SPOTS)[number])) {
    throw new SocialError(400, "Choose how many spots are open.");
  }
  const vibe = input.vibe as InviteVibeId;

  return updateSocial((data) => {
    const host = requireUser(data, credentials);
    const now = Date.now();
    const activeCount = data.openInvites.filter((invite) => invite.hostId === host.id && isActiveInvite(invite, now)).length;
    if (activeCount >= MAX_ACTIVE_INVITES_PER_HOST) {
      throw new SocialError(409, `You already have ${MAX_ACTIVE_INVITES_PER_HOST} live invites. End one before starting another.`);
    }
    const createdAt = new Date(now).toISOString();
    const chat: StoredChat = {
      id: createSocialId(),
      kind: "invite",
      memberIds: [host.id],
      readAt: { [host.id]: createdAt },
      createdAt,
      lastMessageAt: createdAt,
    };
    const invite: StoredOpenInvite = {
      id: createSocialId(),
      hostId: host.id,
      place,
      vibe,
      message,
      createdAt,
      expiresAt: new Date(now + durationMinutes * MINUTE).toISOString(),
      spots,
      going: [],
      chatId: chat.id,
    };
    chat.inviteId = invite.id;
    data.chats.push(chat);
    data.openInvites.push(invite);
    pushMessage(data, chat, null, `${host.alias} opened this invite. Everyone who says yes joins this chat.`);
    return openInviteView(data, invite, host);
  });
}

export function rsvpOpenInvite(credentials: DeviceCredentials, inviteId: string, going: boolean) {
  return updateSocial((data) => {
    const user = requireUser(data, credentials);
    const invite = data.openInvites.find((item) => item.id === inviteId);
    if (!invite || isBlockedBetween(data, user.id, invite.hostId)) throw new SocialError(404, "This invite is no longer available.");
    if (invite.hostId === user.id) throw new SocialError(400, "You can't RSVP to your own invite.");
    const chat = data.chats.find((item) => item.id === invite.chatId);
    if (!chat) throw new SocialError(404, "This invite is no longer available.");
    const isGoing = invite.going.includes(user.id);

    if (going) {
      if (isGoing) return openInviteView(data, invite, user);
      if (!isActiveInvite(invite, Date.now())) throw new SocialError(410, "This invite has ended.");
      if (invite.spots > 0 && invite.going.length >= invite.spots) throw new SocialError(409, "This invite is full.");
      invite.going.push(user.id);
      if (!chat.memberIds.includes(user.id)) chat.memberIds.push(user.id);
      pushMessage(data, chat, null, `${user.alias} is in!`);
      pushNotification(
        data,
        invite.hostId,
        "rsvp",
        `${user.alias} is in for ${vibeLabel(invite.vibe).toLowerCase()} at ${invite.place.title}`,
        { chatId: chat.id, inviteId: invite.id },
      );
    } else if (isGoing) {
      invite.going = invite.going.filter((id) => id !== user.id);
      chat.memberIds = chat.memberIds.filter((id) => id !== user.id);
      pushMessage(data, chat, null, `${user.alias} left the invite.`);
    }
    return openInviteView(data, invite, user);
  });
}

export function endOpenInvite(credentials: DeviceCredentials, inviteId: string) {
  return updateSocial((data) => {
    const user = requireUser(data, credentials);
    const invite = data.openInvites.find((item) => item.id === inviteId);
    if (!invite || invite.hostId !== user.id) throw new SocialError(404, "Invite not found.");
    if (isActiveInvite(invite, Date.now())) {
      invite.endedAt = new Date().toISOString();
      const chat = data.chats.find((item) => item.id === invite.chatId);
      if (chat) pushMessage(data, chat, null, `${user.alias} ended the invite. This chat stays open for 12 hours.`);
      for (const guestId of invite.going) {
        pushNotification(data, guestId, "invite_ended", `${user.alias} closed the ${vibeLabel(invite.vibe).toLowerCase()} invite at ${invite.place.title}`, {
          chatId: invite.chatId,
          inviteId: invite.id,
        });
      }
    }
    return openInviteView(data, invite, user);
  });
}

function requireMemberChat(data: SocialData, user: StoredUser, chatId: string) {
  const chat = data.chats.find((item) => item.id === chatId);
  if (!chat || !chat.memberIds.includes(user.id)) throw new SocialError(404, "Chat not found.");
  return chat;
}

export function getChat(credentials: DeviceCredentials, chatId: string, after?: string) {
  return updateSocial((data, control): ChatDetail => {
    const user = requireUser(data, credentials);
    const chat = requireMemberChat(data, user, chatId);
    const now = Date.now();
    const summary = chatSummary(data, chat, user, now);
    if (summary.unread > 0) {
      chat.readAt[user.id] = new Date(now).toISOString();
      summary.unread = 0;
    } else {
      control.skipWrite = true;
    }
    const afterTime = after ? Date.parse(after) : NaN;
    const messages: ChatMessage[] = data.messages
      .filter((item) => item.chatId === chat.id)
      .filter((item) => !(item.senderId && user.blocked.includes(item.senderId)))
      .filter((item) => !Number.isFinite(afterTime) || Date.parse(item.createdAt) > afterTime)
      .map((item) => ({ ...item, senderAlias: aliasOf(data, item.senderId) }));
    return {
      chat: summary,
      members: chat.memberIds.flatMap((id) => {
        const member = userById(data, id);
        return member ? [publicUser(member)] : [];
      }),
      messages,
      canSend: summary.active,
    };
  });
}

export function sendChatMessage(credentials: DeviceCredentials, chatId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new SocialError(400, "Write a message first.");
  if (trimmed.length > MAX_MESSAGE_LENGTH) throw new SocialError(400, `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);
  return updateSocial((data): ChatMessage => {
    const user = requireUser(data, credentials);
    const chat = requireMemberChat(data, user, chatId);
    if (!chatSummary(data, chat, user, Date.now()).active) throw new SocialError(403, "This chat is closed.");
    const message = pushMessage(data, chat, user.id, trimmed);
    return { ...message, senderAlias: user.alias };
  });
}

function hasMutualConnection(data: SocialData, firstId: string, secondId: string) {
  const connected = (from: string, to: string) => data.connections.some((item) =>
    item.fromId === from && item.toId === to && item.action === "connect");
  return connected(firstId, secondId) && connected(secondId, firstId);
}

function getOrCreateDirectChat(data: SocialData, first: StoredUser, second: StoredUser, opener: string) {
  const existing = data.chats.find((chat) =>
    chat.kind === "direct" && chat.memberIds.includes(first.id) && chat.memberIds.includes(second.id));
  if (existing) return existing;
  const createdAt = new Date().toISOString();
  const chat: StoredChat = {
    id: createSocialId(),
    kind: "direct",
    memberIds: [first.id, second.id],
    readAt: {},
    createdAt,
    lastMessageAt: createdAt,
  };
  data.chats.push(chat);
  pushMessage(data, chat, null, opener);
  return chat;
}

export function openDirectChat(credentials: DeviceCredentials, otherUserId: string) {
  return updateSocial((data) => {
    const user = requireUser(data, credentials);
    const other = userById(data, otherUserId);
    if (!other || other.id === user.id || isBlockedBetween(data, user.id, other.id)) {
      throw new SocialError(404, "That person isn't available to message.");
    }
    const sharedInviteChat = data.chats.find((chat) =>
      chat.kind === "invite" && chat.memberIds.includes(user.id) && chat.memberIds.includes(other.id));
    const matched = hasMutualConnection(data, user.id, other.id);
    if (!sharedInviteChat && !matched) {
      throw new SocialError(403, "You can message people after you match or join the same invite.");
    }
    const sharedInvite = sharedInviteChat && data.openInvites.find((invite) => invite.id === sharedInviteChat.inviteId);
    const opener = matched
      ? "You matched on shared vibes. Say hi!"
      : `You're both on the ${sharedInvite ? `${vibeLabel(sharedInvite.vibe).toLowerCase()} invite at ${sharedInvite.place.title}` : "same invite"}.`;
    return { chatId: getOrCreateDirectChat(data, user, other, opener).id };
  });
}

export function listMatches(credentials: DeviceCredentials, center: Coordinates, radiusKm: number) {
  return updateSocial((data, control): MatchCandidate[] => {
    control.skipWrite = true;
    const viewer = requireUser(data, credentials);
    if (!viewer.discoverable) throw new SocialError(409, "Turn on \"Show me in Meet\" in your social profile to see people nearby.");
    const now = Date.now();
    const decided = new Set(data.connections.filter((item) => item.fromId === viewer.id).map((item) => item.toId));
    return data.users
      .filter((user) =>
        user.id !== viewer.id &&
        user.discoverable &&
        user.approxLat !== undefined && user.approxLng !== undefined &&
        now - Date.parse(user.lastSeenAt) <= ACTIVE_USER_WINDOW_MS &&
        !decided.has(user.id) &&
        !isBlockedBetween(data, viewer.id, user.id))
      .map((user) => ({
        user,
        sharedVibes: user.vibes.filter((vibe) => viewer.vibes.includes(vibe)),
        meters: distanceInMeters(center.lat, center.lng, user.approxLat!, user.approxLng!),
      }))
      .filter(({ sharedVibes, meters }) => sharedVibes.length > 0 && meters <= radiusKm * 1000)
      .sort((a, b) => b.sharedVibes.length - a.sharedVibes.length || a.meters - b.meters)
      .slice(0, 30)
      .map(({ user, sharedVibes, meters }) => ({
        ...publicUser(user),
        sharedVibes,
        // Locations are rounded to ~1 km, so never show more precision than that.
        distanceKm: Math.max(1, Math.round(meters / 1000)),
      }));
  });
}

export function respondToMatch(credentials: DeviceCredentials, targetId: string, action: "connect" | "pass") {
  return updateSocial((data) => {
    const user = requireUser(data, credentials);
    const target = userById(data, targetId);
    if (!target || target.id === user.id || isBlockedBetween(data, user.id, target.id)) {
      throw new SocialError(404, "That person isn't available.");
    }
    data.connections = data.connections.filter((item) => !(item.fromId === user.id && item.toId === target.id));
    data.connections.push({ fromId: user.id, toId: target.id, action, createdAt: new Date().toISOString() });
    if (action !== "connect" || !hasMutualConnection(data, user.id, target.id)) return { matched: false };

    const shared = target.vibes.filter((vibe) => user.vibes.includes(vibe)).map((vibe) => vibeLabel(vibe).toLowerCase());
    const chat = getOrCreateDirectChat(data, user, target, "You matched on shared vibes. Say hi!");
    const sharedText = shared.length ? ` over ${shared.join(", ")}` : "";
    pushNotification(data, target.id, "match", `You and ${user.alias} matched${sharedText}`, { chatId: chat.id });
    pushNotification(data, user.id, "match", `You and ${target.alias} matched${sharedText}`, { chatId: chat.id });
    return { matched: true, chatId: chat.id };
  });
}

export function blockUser(credentials: DeviceCredentials, targetId: string) {
  return updateSocial((data) => {
    const user = requireUser(data, credentials);
    const target = userById(data, targetId);
    if (!target || target.id === user.id) throw new SocialError(404, "That person isn't available.");
    if (!user.blocked.includes(target.id)) user.blocked.push(target.id);
    // Remove a blocked guest from the blocker's own invites and their group chats.
    for (const invite of data.openInvites) {
      if (invite.hostId !== user.id || !invite.going.includes(target.id)) continue;
      invite.going = invite.going.filter((id) => id !== target.id);
      const chat = data.chats.find((item) => item.id === invite.chatId);
      if (chat) chat.memberIds = chat.memberIds.filter((id) => id !== target.id);
    }
    return { ok: true };
  });
}

export function reportUser(credentials: DeviceCredentials, input: Record<string, unknown>) {
  const targetId = typeof input.userId === "string" ? input.userId : "";
  const reason = input.reason as ReportReason;
  const details = typeof input.details === "string" ? input.details.trim().slice(0, 500) : "";
  if (!REPORT_REASONS.includes(reason)) throw new SocialError(400, "Choose a reason for the report.");
  return updateSocial((data) => {
    const user = requireUser(data, credentials);
    if (!userById(data, targetId) || targetId === user.id) throw new SocialError(404, "That person isn't available.");
    data.reports.push({
      id: createSocialId(),
      reporterId: user.id,
      targetId,
      ...(typeof input.chatId === "string" ? { chatId: input.chatId.slice(0, 20) } : {}),
      reason,
      details,
      createdAt: new Date().toISOString(),
    });
    return { ok: true };
  });
}
