import type { InvitePlace, InviteVibeId } from "@/lib/invite-vibes";

// Shared shapes for open invites, vibe matching, notifications and chat.
// Everything here is safe to import on the client.

export const DEVICE_ID_PATTERN = /^[a-z0-9]{16}$/;
export const DEVICE_SECRET_PATTERN = /^[a-z0-9]{32}$/;
export const SOCIAL_ID_PATTERN = /^[a-z0-9]{12}$/;
export const DEVICE_HEADER = "x-find-tony-device";

export const OPEN_INVITE_DURATIONS = [60, 120, 240] as const;
export const OPEN_INVITE_SPOTS = [0, 2, 4, 8] as const;
export const MAX_SOCIAL_VIBES = 5;
export const MAX_MESSAGE_LENGTH = 500;

export interface SocialProfile {
  id: string;
  alias: string;
  vibes: InviteVibeId[];
  bio: string;
  discoverable: boolean;
}

export interface PublicUser {
  id: string;
  alias: string;
  vibes: InviteVibeId[];
  bio: string;
}

export interface OpenInviteView {
  id: string;
  place: InvitePlace;
  vibe: InviteVibeId;
  message: string;
  hostId: string;
  hostAlias: string;
  hostBio: string;
  hostVibes: InviteVibeId[];
  createdAt: string;
  expiresAt: string;
  /** 0 means no limit. */
  spots: number;
  goingCount: number;
  isMine: boolean;
  amGoing: boolean;
  /** Only present for the host and people who said yes. */
  chatId?: string;
  /** Only present for the host and people who said yes. */
  going?: PublicUser[];
}

export type NotificationType = "rsvp" | "match" | "invite_ended";

export interface SocialNotification {
  id: string;
  type: NotificationType;
  text: string;
  createdAt: string;
  read: boolean;
  chatId?: string;
  inviteId?: string;
}

export interface ChatSummary {
  id: string;
  kind: "invite" | "direct";
  title: string;
  subtitle: string;
  inviteId?: string;
  otherUserId?: string;
  /** False once an invite has ended/expired or a direct chat member blocked the other. */
  active: boolean;
  unread: number;
  lastMessage?: { text: string; senderAlias: string; createdAt: string };
  lastMessageAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string | null;
  senderAlias: string;
  text: string;
  createdAt: string;
}

export interface ChatDetail {
  chat: ChatSummary;
  members: PublicUser[];
  messages: ChatMessage[];
  canSend: boolean;
}

export interface SyncResponse {
  profile: SocialProfile | null;
  notifications: SocialNotification[];
  chats: ChatSummary[];
  unreadMessages: number;
}

export interface MatchCandidate extends PublicUser {
  sharedVibes: InviteVibeId[];
  distanceKm: number;
}

export type ReportReason = "harassment" | "spam" | "unsafe" | "other";
export const REPORT_REASONS: ReportReason[] = ["harassment", "spam", "unsafe", "other"];
