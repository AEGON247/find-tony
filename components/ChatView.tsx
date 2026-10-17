"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Ban, Flag, MessageCircle, Send } from "lucide-react";
import { useSocial } from "@/context/SocialContext";
import { socialFetch } from "@/lib/social-client";
import { MAX_MESSAGE_LENGTH, type ChatDetail, type ChatMessage, type PublicUser } from "@/lib/social-types";
import { INVITE_TIME_ZONE, INVITE_VIBES } from "@/lib/invite-vibes";

const CHAT_POLL_MS = 3_000;

function messageTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", { timeZone: INVITE_TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

type SafetyMode = { userId: string; step: "menu" | "block" | "report" };

export default function ChatView({ chatId, onBack }: { chatId: string; onBack: () => void }) {
  const { profile, messageUser, blockUser, reportUser, refresh } = useSocial();
  const [detail, setDetail] = useState<ChatDetail>();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [safety, setSafety] = useState<SafetyMode>();
  const [notice, setNotice] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const lastMessageId = useRef<string | undefined>(undefined);
  const myId = profile?.id;

  const load = useCallback(async () => {
    const result = await socialFetch<ChatDetail>(`/api/social/chats/${chatId}`);
    setDetail(result);
    return result;
  }, [chatId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      try {
        await load();
        if (!cancelled) setError("");
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this chat.");
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, CHAT_POLL_MS);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    const latest = detail?.messages.at(-1)?.id;
    if (latest && latest !== lastMessageId.current) {
      lastMessageId.current = latest;
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [detail]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await socialFetch<{ item: ChatMessage }>(`/api/social/chats/${chatId}`, { method: "POST", json: { text } });
      setText("");
      setDetail((current) => current ? { ...current, messages: [...current.messages, result.item] } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function runSafety(task: () => Promise<void>, message: string) {
    try {
      await task();
      setSafety(undefined);
      setNotice(message);
      await load();
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That didn't work. Try again.");
    }
  }

  const chat = detail?.chat;
  const others = detail?.members.filter((member) => member.id !== myId) ?? [];
  const safetyTarget: PublicUser | undefined = safety ? others.find((member) => member.id === safety.userId) : undefined;
  const directPartner = chat?.kind === "direct" ? others[0] : undefined;

  return (
    <div className="chat-view">
      <header className="chat-view__header">
        <button className="chat-view__back" onClick={onBack} aria-label="Back to inbox"><ArrowLeft size={18} /></button>
        <div className="chat-view__title">
          <p className="eyebrow">{chat?.kind === "invite" ? "GROUP CHAT" : "DIRECT MESSAGE"}</p>
          <h3>{chat?.title ?? "Loading..."}</h3>
          {chat && <span>{chat.subtitle}</span>}
        </div>
        {directPartner && (
          <button className="chat-view__menu" aria-label={`Safety options for ${directPartner.alias}`} onClick={() => setSafety({ userId: directPartner.id, step: "menu" })}>
            <Flag size={15} />
          </button>
        )}
      </header>

      {chat?.kind === "invite" && others.length > 0 && (
        <div className="chat-view__members" aria-label="People in this chat">
          {others.map((member) => (
            <button key={member.id} className="chat-member" onClick={() => setSafety({ userId: member.id, step: "menu" })}>
              <span className="chat-member__avatar" aria-hidden="true">{member.alias.slice(0, 1).toUpperCase()}</span>
              {member.alias}
            </button>
          ))}
        </div>
      )}

      {safety && safetyTarget && (
        <div className="chat-safety" role="group" aria-label={`Options for ${safetyTarget.alias}`}>
          <div className="chat-safety__who">
            <strong>{safetyTarget.alias}</strong>
            {safetyTarget.bio && <span>{safetyTarget.bio}</span>}
            {safetyTarget.vibes.length > 0 && <span>{safetyTarget.vibes.map((vibe) => INVITE_VIBES[vibe].label).join(" · ")}</span>}
          </div>
          {safety.step === "menu" && (
            <div className="chat-safety__actions">
              {chat?.kind === "invite" && (
                <button onClick={() => {
                  messageUser(safetyTarget.id).catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : "Could not open a private chat.");
                  });
                }}>
                  <MessageCircle size={13} aria-hidden="true" /> MESSAGE PRIVATELY
                </button>
              )}
              <button onClick={() => setSafety({ ...safety, step: "block" })}><Ban size={13} aria-hidden="true" /> BLOCK</button>
              <button onClick={() => setSafety({ ...safety, step: "report" })}><Flag size={13} aria-hidden="true" /> REPORT</button>
              <button onClick={() => setSafety(undefined)}>CLOSE</button>
            </div>
          )}
          {safety.step === "block" && (
            <div className="chat-safety__actions">
              <span>Block {safetyTarget.alias}? You won&apos;t see each other&apos;s invites, matches or messages.</span>
              <button className="is-danger" onClick={() => void runSafety(() => blockUser(safetyTarget.id), `${safetyTarget.alias} is blocked.`)}>YES, BLOCK</button>
              <button onClick={() => setSafety(undefined)}>CANCEL</button>
            </div>
          )}
          {safety.step === "report" && (
            <div className="chat-safety__actions">
              <span>Report {safetyTarget.alias} for:</span>
              {["harassment", "spam", "unsafe", "other"].map((reason) => (
                <button
                  key={reason}
                  className="is-danger"
                  onClick={() => void runSafety(async () => {
                    await reportUser(safetyTarget.id, reason, chatId);
                    await blockUser(safetyTarget.id);
                  }, `Thanks. ${safetyTarget.alias} was reported and blocked.`)}
                >
                  {reason.toUpperCase()}
                </button>
              ))}
              <button onClick={() => setSafety(undefined)}>CANCEL</button>
            </div>
          )}
        </div>
      )}

      <ol className="chat-view__messages" ref={listRef} aria-live="polite">
        {detail?.messages.map((message) => message.senderId === null ? (
          <li key={message.id} className="chat-message chat-message--system">{message.text}</li>
        ) : (
          <li key={message.id} className={`chat-message ${message.senderId === myId ? "chat-message--mine" : ""}`}>
            {message.senderId !== myId && chat?.kind === "invite" && <span className="chat-message__author">{message.senderAlias}</span>}
            <p>{message.text}</p>
            <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
          </li>
        ))}
        {detail && detail.messages.length === 0 && <li className="chat-message chat-message--system">No messages yet.</li>}
      </ol>

      {notice && <p className="chat-view__notice" role="status">{notice}</p>}
      {error && <p className="form-error chat-view__error" role="alert">{error}</p>}

      {detail?.canSend === false ? (
        <p className="chat-view__closed">This chat is closed.</p>
      ) : (
        <form className="chat-view__composer" onSubmit={send}>
          <input
            aria-label="Message"
            value={text}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(event) => setText(event.target.value)}
            placeholder={chat?.kind === "invite" ? "Coordinate with the crew..." : "Say hi..."}
            disabled={!detail}
          />
          <button type="submit" aria-label="Send message" disabled={sending || !text.trim()}><Send size={17} /></button>
        </form>
      )}
    </div>
  );
}
