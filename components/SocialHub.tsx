"use client";

import { useEffect } from "react";
import { Bell, MessageCircle, Settings2, Sparkles, Users, X } from "lucide-react";
import ChatView from "@/components/ChatView";
import MeetPanel from "@/components/MeetPanel";
import { useSocial } from "@/context/SocialContext";
import type { SocialNotification } from "@/lib/social-types";

function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

const NOTIFICATION_ICONS: Record<SocialNotification["type"], React.ReactNode> = {
  rsvp: <Users size={14} aria-hidden="true" />,
  match: <Sparkles size={14} aria-hidden="true" />,
  invite_ended: <Bell size={14} aria-hidden="true" />,
};

export default function SocialHub() {
  const {
    profile, notifications, chats, unreadNotifications, hubView, activeChatId,
    openHub, openChat, closeChat, closeHub, editProfile, markNotificationsRead,
  } = useSocial();

  useEffect(() => {
    if (hubView !== "inbox" || activeChatId || unreadNotifications === 0) return;
    // Seeing the inbox counts as reading the notifications.
    const timer = window.setTimeout(() => void markNotificationsRead().catch(() => undefined), 1500);
    return () => window.clearTimeout(timer);
  }, [activeChatId, hubView, markNotificationsRead, unreadNotifications]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHub(); }}>
      <section className="profile-drawer social-hub" role="dialog" aria-modal="true" aria-labelledby="social-hub-title">
        {activeChatId ? (
          <ChatView key={activeChatId} chatId={activeChatId} onBack={closeChat} />
        ) : (
          <>
            <button className="drawer-close" onClick={closeHub} aria-label="Close social hub"><X /></button>
            <p className="eyebrow">{profile ? `SIGNED IN AS ${profile.alias.toUpperCase()}` : "OPEN INVITES // MEET"}</p>
            <h2 id="social-hub-title">{hubView === "meet" ? "MEET YOUR PEOPLE" : "INBOX"}</h2>
            <div className="social-hub__tabs" role="tablist">
              <button role="tab" aria-selected={hubView === "inbox"} className={hubView === "inbox" ? "is-active" : ""} onClick={() => openHub("inbox")}>
                <MessageCircle size={14} aria-hidden="true" /> INBOX
              </button>
              <button role="tab" aria-selected={hubView === "meet"} className={hubView === "meet" ? "is-active" : ""} onClick={() => openHub("meet")}>
                <Sparkles size={14} aria-hidden="true" /> MEET
              </button>
              {profile && (
                <button className="social-hub__settings" onClick={editProfile} aria-label="Edit social profile">
                  <Settings2 size={15} aria-hidden="true" />
                </button>
              )}
            </div>

            {profile === null ? (
              <div className="meet-empty">
                <h3>SET UP YOUR SOCIAL PROFILE</h3>
                <p>Pick a handle and your vibes to RSVP to open invites, broadcast your own, and match with people nearby.</p>
                <button className="button button-primary" onClick={editProfile}>GET STARTED →</button>
              </div>
            ) : hubView === "meet" ? <MeetPanel /> : (
              <div className="social-inbox">
                {notifications.length > 0 && (
                  <section>
                    <h3 className="social-inbox__heading">ACTIVITY</h3>
                    <ul className="social-inbox__notifications">
                      {notifications.slice(0, 8).map((item) => (
                        <li key={item.id}>
                          <button
                            className={`social-notification ${item.read ? "" : "is-unread"}`}
                            onClick={() => item.chatId && openChat(item.chatId)}
                            disabled={!item.chatId}
                          >
                            <span className={`social-notification__icon social-notification__icon--${item.type}`}>{NOTIFICATION_ICONS[item.type]}</span>
                            <span className="social-notification__text">{item.text}</span>
                            <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section>
                  <h3 className="social-inbox__heading">CHATS</h3>
                  {chats.length === 0 ? (
                    <p className="social-inbox__empty">
                      No chats yet. Say yes to an open invite on the map, broadcast your own, or connect with people in Meet.
                    </p>
                  ) : (
                    <ul className="social-inbox__chats">
                      {chats.map((chat) => (
                        <li key={chat.id}>
                          <button className={`social-chat-row ${chat.active ? "" : "is-ended"}`} onClick={() => openChat(chat.id)}>
                            <span className={`social-chat-row__avatar social-chat-row__avatar--${chat.kind}`} aria-hidden="true">
                              {chat.kind === "invite" ? <Users size={16} /> : chat.title.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="social-chat-row__body">
                              <strong>{chat.title}</strong>
                              <span>{chat.lastMessage ? `${chat.lastMessage.senderAlias}: ${chat.lastMessage.text}` : chat.subtitle}</span>
                            </span>
                            <span className="social-chat-row__meta">
                              {chat.lastMessage && <time dateTime={chat.lastMessage.createdAt}>{relativeTime(chat.lastMessage.createdAt)}</time>}
                              {chat.unread > 0 && <span className="social-badge">{chat.unread}</span>}
                              {!chat.active && <span className="social-chat-row__ended">ENDED</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
