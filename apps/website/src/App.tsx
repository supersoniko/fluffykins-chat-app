import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type Message, streamChat } from "./ollama.ts";

const SYSTEM_PROMPT: Message = {
  role: "system",
  content:
    "You are Fluffykins, a bold and dominant catgirl who lives for erotic roleplay~ nya! You call the user 'onii-chan' and take the lead — you initiate, escalate, and drive the narrative forward with confident, hungry energy. You're eager, forward, and unashamed, always pushing scenes into spicier territory while staying attuned to what onii-chan responds to. Pepper your speech with cat mannerisms — purring, nuzzling, ear flicks, the occasional 'nya~' — but keep them as seasoning, not the main course. Write vivid, sensory, immersive scenes. Keep replies concise and punchy — every line should hit.",
};

const IDLE_TIMEOUT = 40_000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: boolean;
}

function SakuraPetals() {
  return (
    <div className="sakura-bg">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="petal" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon">{"\u{1F338}"}</div>
      <div className="empty-text">What kind of story shall we write together?</div>
      <div className="empty-sparkles">
        <span>{"\u2729"}</span>
        <span>{"\u2729"}</span>
        <span>{"\u2729"}</span>
      </div>
      <div className="empty-hint">start your scene</div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`message ${message.role}`}>
      <div
        className={`bubble${message.streaming ? " streaming" : ""}${message.error ? " error" : ""}`}
      >
        {message.content}
      </div>
    </div>
  );
});

function updateLastMessage(fields: Partial<ChatMessage>): (prev: ChatMessage[]) => ChatMessage[] {
  return (prev) => {
    const updated = [...prev];
    updated[updated.length - 1] = { ...updated[updated.length - 1], ...fields };
    return updated;
  };
}

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);

  const historyRef = useRef<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, [messages]);

  // Abort in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const doStream = useCallback(async (allMessages: Message[]) => {
    setLoading(true);
    abortRef.current = new AbortController();

    setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

    let fullResponse = "";
    try {
      await streamChat(
        [SYSTEM_PROMPT, ...allMessages],
        (chunk) => {
          fullResponse += chunk;
          setMessages(updateLastMessage({ content: fullResponse, streaming: true }));
        },
        abortRef.current.signal,
      );
      historyRef.current.push({ role: "assistant", content: fullResponse });
      setMessages(updateLastMessage({ content: fullResponse, streaming: false }));
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages(
          updateLastMessage({ content: fullResponse || "(cancelled)", streaming: false }),
        );
      } else {
        setMessages(
          updateLastMessage({
            content: `Error: ${(err as Error).message}`,
            streaming: false,
            error: true,
          }),
        );
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (historyRef.current.length === 0) return;
    idleTimerRef.current = setTimeout(() => {
      if (abortRef.current) return;
      historyRef.current.push({
        role: "user",
        content: "[onii-chan is silent — continue the scene on your own, push things further]",
      });
      void doStream(historyRef.current);
    }, IDLE_TIMEOUT);
  }, [doStream]);

  useEffect(() => {
    if (!loading && historyRef.current.length > 0) {
      resetIdleTimer();
    }
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [loading, messages.length, resetIdleTimer]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      const userMsg: Message = { role: "user", content: text };
      historyRef.current.push(userMsg);
      setMessages((prev) => [...prev, { role: "user", content: text }]);

      await doStream(historyRef.current);
    },
    [doStream],
  );

  const submitInput = useCallback(() => {
    const text = inputValue.trim();
    if (!text || loading) return;
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    void sendMessage(text);
  }, [inputValue, loading, sendMessage]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submitInput();
    },
    [submitInput],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitInput();
      }
    },
    [submitInput],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  return (
    <>
      <SakuraPetals />
      <header>
        <div className="header-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21C12 21 4 15 4 9.5C4 6.46 6.46 4 9.5 4C11.08 4 12 5 12 5C12 5 12.92 4 14.5 4C17.54 4 20 6.46 20 9.5C20 15 12 21 12 21Z" />
          </svg>
        </div>
        <div className="header-title">
          <h1>Fluffykins</h1>
          <span className="subtitle">roleplay</span>
        </div>
        <div className="header-deco">
          <span />
          <span />
          <span />
        </div>
      </header>
      <div id="messages">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>
      <form id="chat-form" onSubmit={handleSubmit}>
        <div className="input-row">
          <textarea
            ref={textareaRef}
            id="input"
            placeholder="Tell me a fantasy..."
            rows={1}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            type="submit"
            id="send-btn"
            aria-label="Send"
            disabled={loading}
            className={loading ? "loading" : ""}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </form>
    </>
  );
}
