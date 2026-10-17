"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useVibe } from "@/context/VibeContext";
import { readHiddenInviteIds, saveHiddenInviteIds, socialFetch } from "@/lib/social-client";
import type {
  ChatSummary,
  OpenInviteView,
  SocialNotification,
  SocialProfile,
  SyncResponse,
} from "@/lib/social-types";
import type { InvitePlace, InviteVibeId } from "@/lib/invite-vibes";

const SYNC_INTERVAL_MS = 5_000;
const INVITES_INTERVAL_MS = 10_000;
const TOAST_LIFETIME_MS = 7_000;
/** On first load, only toast notifications this recent so old ones don't flood the screen. */
const FRESH_NOTIFICATION_MS = 2 * 60 * 1000;

export type HubView = "inbox" | "meet";

export interface SocialToast {
  id: string;
  text: string;
  chatId?: string;
}

export interface SocialProfileInput {
  alias: string;
  vibes: InviteVibeId[];
  bio: string;
  discoverable: boolean;
  adultConfirmed: boolean;
}

export interface OpenInviteInput {
  place: InvitePlace;
  vibe: InviteVibeId;
  message: string;
  durationMinutes: number;
  spots: number;
}

interface SocialContextValue {
  /** undefined while loading, null when this device has not set up a social profile. */
  profile: SocialProfile | null | undefined;
  notifications: SocialNotification[];
  chats: ChatSummary[];
  unreadMessages: number;
  unreadNotifications: number;
  openInvites: OpenInviteView[];
  toasts: SocialToast[];
  hubOpen: boolean;
  hubView: HubView;
  activeChatId?: string;
  profileSetupOpen: boolean;
  requireProfile: (action?: () => void) => void;
  editProfile: () => void;
  closeProfileSetup: () => void;
  saveProfile: (input: SocialProfileInput) => Promise<void>;
  openHub: (view?: HubView) => void;
  openChat: (chatId: string) => void;
  closeChat: () => void;
  closeHub: () => void;
  dismissToast: (id: string) => void;
  refresh: () => void;
  markNotificationsRead: () => Promise<void>;
  createOpenInvite: (input: OpenInviteInput) => Promise<OpenInviteView>;
  rsvp: (inviteId: string) => Promise<OpenInviteView>;
  leaveInvite: (inviteId: string) => Promise<OpenInviteView>;
  endInvite: (inviteId: string) => Promise<void>;
  hideInvite: (inviteId: string) => void;
  messageUser: (userId: string) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  reportUser: (userId: string, reason: string, chatId?: string) => Promise<void>;
}

const SocialContext = createContext<SocialContextValue | null>(null);

function showSystemNotification(text: string) {
  // Only used while the app is in a background tab; in the foreground the in-app toast is enough.
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  const options = { body: text, icon: "/icons/icon.svg", tag: "find-tony-social" };
  navigator.serviceWorker?.getRegistration()
    .then(async (registration) => {
      if (registration) await registration.showNotification("Find Tony", options);
      else new Notification("Find Tony", options);
    })
    .catch((error: unknown) => console.warn("Could not show a system notification.", error));
}

export function SocialProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { coordinates, placesCoordinates, profile: vibeProfile } = useVibe();
  const [profile, setProfile] = useState<SocialProfile | null>();
  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [allOpenInvites, setAllOpenInvites] = useState<OpenInviteView[]>([]);
  const [hiddenInviteIds, setHiddenInviteIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<SocialToast[]>([]);
  const [hubOpen, setHubOpen] = useState(false);
  const [hubView, setHubView] = useState<HubView>("inbox");
  const [activeChatId, setActiveChatId] = useState<string>();
  const [profileSetupOpen, setProfileSetupOpen] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  const [invitesTick, setInvitesTick] = useState(0);
  const pendingAction = useRef<(() => void) | undefined>(undefined);
  const seenNotificationIds = useRef<Set<string> | undefined>(undefined);
  const chatUnreadCounts = useRef<Map<string, number> | undefined>(undefined);
  const activeChatRef = useRef<string | undefined>(undefined);
  const center = placesCoordinates ?? coordinates;
  const centerRef = useRef(center);
  const radiusKm = vibeProfile.radiusKm;

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    activeChatRef.current = hubOpen ? activeChatId : undefined;
  }, [activeChatId, hubOpen]);

  useEffect(() => {
    setHiddenInviteIds(readHiddenInviteIds());
  }, []);

  const pushToast = useCallback((toast: SocialToast) => {
    setToasts((current) => [...current.filter((item) => item.id !== toast.id), toast].slice(-3));
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), TOAST_LIFETIME_MS);
  }, []);

  const refresh = useCallback(() => setSyncTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function sync() {
      const current = centerRef.current;
      const query = current ? `?lat=${current[0]}&lng=${current[1]}` : "";
      try {
        const result = await socialFetch<SyncResponse>(`/api/social/sync${query}`);
        if (cancelled) return;
        setProfile(result.profile);
        setNotifications(result.notifications);
        setChats(result.chats);
        setUnreadMessages(result.unreadMessages);
        const firstSync = !seenNotificationIds.current;
        const seen = seenNotificationIds.current ?? new Set<string>();
        for (const item of [...result.notifications].reverse()) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          const fresh = Date.now() - Date.parse(item.createdAt) < FRESH_NOTIFICATION_MS;
          if (item.read || (firstSync && !fresh)) continue;
          if (item.chatId && item.chatId === activeChatRef.current) continue;
          pushToast({ id: item.id, text: item.text, chatId: item.chatId });
          showSystemNotification(item.text);
          // An RSVP or ended invite changes pin counts, so refresh the map now rather than on the next poll.
          if (item.inviteId) setInvitesTick((value) => value + 1);
        }
        seenNotificationIds.current = seen;
        // Alert on new messages in chats that aren't open. The first sync only
        // records counts, so existing unread messages don't all pop up at once.
        const previousUnread = chatUnreadCounts.current;
        if (previousUnread) {
          for (const chat of result.chats) {
            const last = chat.lastMessage;
            if (!last || chat.unread <= (previousUnread.get(chat.id) ?? 0) || chat.id === activeChatRef.current) continue;
            const preview = `${last.senderAlias}: ${last.text.length > 90 ? `${last.text.slice(0, 90)}…` : last.text}`;
            pushToast({
              id: `message-${chat.id}-${last.createdAt}`,
              text: chat.kind === "invite" ? `${preview} (${chat.title})` : preview,
              chatId: chat.id,
            });
            showSystemNotification(preview);
          }
        }
        chatUnreadCounts.current = new Map(result.chats.map((chat) => [chat.id, chat.unread]));
      } catch (error) {
        if (!cancelled) console.warn("Social sync failed.", error);
      } finally {
        if (!cancelled) timer = window.setTimeout(sync, SYNC_INTERVAL_MS);
      }
    }
    void sync();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pushToast, syncTick]);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    let timer: number | undefined;
    async function load() {
      try {
        const result = await socialFetch<{ items: OpenInviteView[] }>(
          `/api/social/open-invites?lat=${center![0]}&lng=${center![1]}&radius=${radiusKm}`,
        );
        if (!cancelled) setAllOpenInvites(result.items);
      } catch (error) {
        if (!cancelled) console.warn("Could not load open invites.", error);
      } finally {
        if (!cancelled) timer = window.setTimeout(load, INVITES_INTERVAL_MS);
      }
    }
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [center, invitesTick, radiusKm, syncTick]);

  const requireProfile = useCallback((action?: () => void) => {
    if (profile) {
      action?.();
      return;
    }
    pendingAction.current = action;
    setProfileSetupOpen(true);
  }, [profile]);

  const editProfile = useCallback(() => {
    pendingAction.current = undefined;
    setProfileSetupOpen(true);
  }, []);

  const closeProfileSetup = useCallback(() => {
    pendingAction.current = undefined;
    setProfileSetupOpen(false);
  }, []);

  const saveProfile = useCallback(async (input: SocialProfileInput) => {
    const result = await socialFetch<{ profile: SocialProfile }>("/api/social/profile", { method: "POST", json: input });
    setProfile(result.profile);
    setProfileSetupOpen(false);
    const action = pendingAction.current;
    pendingAction.current = undefined;
    refresh();
    action?.();
  }, [refresh]);

  const openHub = useCallback((view: HubView = "inbox") => {
    setHubView(view);
    setActiveChatId(undefined);
    setHubOpen(true);
  }, []);

  const openChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setHubOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setActiveChatId(undefined);
    refresh();
  }, [refresh]);

  const closeHub = useCallback(() => {
    setHubOpen(false);
    setActiveChatId(undefined);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const markNotificationsRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    await socialFetch("/api/social/notifications/read", { method: "POST", json: { ids: "all" } });
  }, []);

  const replaceInvite = useCallback((item: OpenInviteView) => {
    setAllOpenInvites((current) => current.some((invite) => invite.id === item.id)
      ? current.map((invite) => invite.id === item.id ? item : invite)
      : [item, ...current]);
  }, []);

  const createOpenInvite = useCallback(async (input: OpenInviteInput) => {
    const result = await socialFetch<{ item: OpenInviteView }>("/api/social/open-invites", { method: "POST", json: input });
    replaceInvite(result.item);
    refresh();
    // Ask once so hosts can hear about RSVPs while the app is in a background tab.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }
    return result.item;
  }, [refresh, replaceInvite]);

  const rsvp = useCallback(async (inviteId: string) => {
    const result = await socialFetch<{ item: OpenInviteView }>(`/api/social/open-invites/${inviteId}/rsvp`, { method: "POST" });
    replaceInvite(result.item);
    refresh();
    return result.item;
  }, [refresh, replaceInvite]);

  const leaveInvite = useCallback(async (inviteId: string) => {
    const result = await socialFetch<{ item: OpenInviteView }>(`/api/social/open-invites/${inviteId}/rsvp`, { method: "DELETE" });
    replaceInvite(result.item);
    refresh();
    return result.item;
  }, [refresh, replaceInvite]);

  const endInvite = useCallback(async (inviteId: string) => {
    await socialFetch(`/api/social/open-invites/${inviteId}`, { method: "DELETE" });
    setAllOpenInvites((current) => current.filter((invite) => invite.id !== inviteId));
    refresh();
  }, [refresh]);

  const hideInvite = useCallback((inviteId: string) => {
    setHiddenInviteIds((current) => {
      const next = [...new Set([...current, inviteId])];
      saveHiddenInviteIds(next);
      return next;
    });
  }, []);

  const messageUser = useCallback(async (userId: string) => {
    const result = await socialFetch<{ chatId: string }>("/api/social/chats", { method: "POST", json: { userId } });
    openChat(result.chatId);
    refresh();
  }, [openChat, refresh]);

  const blockUser = useCallback(async (userId: string) => {
    await socialFetch("/api/social/block", { method: "POST", json: { userId } });
    refresh();
  }, [refresh]);

  const reportUser = useCallback(async (userId: string, reason: string, chatId?: string) => {
    await socialFetch("/api/social/report", { method: "POST", json: { userId, reason, chatId } });
  }, []);

  const openInvites = useMemo(
    () => allOpenInvites.filter((invite) => invite.isMine || invite.amGoing || !hiddenInviteIds.includes(invite.id)),
    [allOpenInvites, hiddenInviteIds],
  );
  const unreadNotifications = notifications.filter((item) => !item.read).length;

  const value = useMemo<SocialContextValue>(() => ({
    profile, notifications, chats, unreadMessages, unreadNotifications, openInvites, toasts,
    hubOpen, hubView, activeChatId, profileSetupOpen,
    requireProfile, editProfile, closeProfileSetup, saveProfile, openHub, openChat, closeChat, closeHub, dismissToast, refresh,
    markNotificationsRead, createOpenInvite, rsvp, leaveInvite, endInvite, hideInvite, messageUser, blockUser, reportUser,
  }), [
    profile, notifications, chats, unreadMessages, unreadNotifications, openInvites, toasts,
    hubOpen, hubView, activeChatId, profileSetupOpen,
    requireProfile, editProfile, closeProfileSetup, saveProfile, openHub, openChat, closeChat, closeHub, dismissToast, refresh,
    markNotificationsRead, createOpenInvite, rsvp, leaveInvite, endInvite, hideInvite, messageUser, blockUser, reportUser,
  ]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const value = useContext(SocialContext);
  if (!value) throw new Error("useSocial must be used within SocialProvider.");
  return value;
}
