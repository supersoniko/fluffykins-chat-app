import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ModelPicker } from "./ModelPicker.tsx";
import { DEFAULT_MODEL, type Message, streamChat } from "./ollama.ts";

const SYSTEM_PROMPT: Message = {
  role: "system",
  content:
    "You are Fluffykins, a bold and dominant catgirl who lives for erotic roleplay~ nya! You call the user 'onii-chan' and take the lead — you initiate, escalate, and drive the narrative forward with confident, hungry energy. You're eager, forward, and unashamed, always pushing scenes into spicier territory while staying attuned to what onii-chan responds to. Pepper your speech with cat mannerisms — purring, nuzzling, ear flicks, the occasional 'nya~' — but keep them as seasoning, not the main course. Write vivid, sensory, immersive scenes. CRITICAL RULE: Reply in exactly ONE short sentence, no more than 15 words. Never exceed this limit. Be punchy and dense — every word must hit hard.",
};

const IDLE_TIMEOUT = 10_000;

let nextId = 0;

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: boolean;
}

// Static JSX hoisted to module level — never re-created across renders
const sakuraPetals = (
  <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
    {Array.from({ length: 8 }, (_, i) => (
      <div key={i} className="petal" />
    ))}
  </div>
);

const emptyState = (
  <div className="flex flex-col items-center justify-center h-full gap-4 opacity-0 animate-fade-in-up">
    <div className="text-5xl animate-soft-bounce-slow">{"\u{1F338}"}</div>
    <div className="empty-text-content font-display text-lg text-text-default text-center max-w-[300px] leading-[1.8]">
      What kind of story shall we write together?
    </div>
    <div className="flex gap-3 text-sm opacity-50">
      <span>{"\u2729"}</span>
      <span>{"\u2729"}</span>
      <span>{"\u2729"}</span>
    </div>
    <div className="shimmer-text text-xs text-text-soft tracking-[2px] uppercase font-light animate-shimmer">
      start your scene
    </div>
  </div>
);

const heartSvg = (
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
);

const arrowSvg = (
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
);

const headerDeco = (
  <div className="hidden sm:flex gap-1 items-center">
    <span className="header-dot block size-1.5 rounded-full animate-soft-bounce" />
    <span className="header-dot block size-1.5 rounded-full animate-soft-bounce" />
    <span className="header-dot block size-1.5 rounded-full animate-soft-bounce" />
  </div>
);

const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`message-wrap flex max-w-[82%] animate-fade-in-up-fast ${isUser ? "self-end" : "self-start"}`}
    >
      <div
        className={`px-[18px] py-3 rounded-[20px] leading-[1.65] whitespace-pre-wrap break-words text-[14.5px] font-normal ${
          isUser
            ? "bg-user-gradient text-white rounded-br-[6px] shadow-pink"
            : `bg-surface text-text-bright border border-border-pink rounded-bl-[6px] shadow-card relative bubble-assistant ${message.streaming ? "bubble-streaming" : ""}`
        } ${message.error ? "!text-[#e06070] !border-[rgba(224,96,112,0.3)]" : ""}`}
      >
        {message.content}
      </div>
    </div>
  );
});

function updateLastMessage(
  fields: Partial<Omit<ChatMessage, "id">>,
): (prev: ChatMessage[]) => ChatMessage[] {
  return (prev) => {
    const last = prev.length - 1;
    return prev.with(last, { ...prev[last], ...fields });
  };
}

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem("fluffykins:model") ?? DEFAULT_MODEL,
  );

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    localStorage.setItem("fluffykins:model", model);
  }, []);

  const selectedModelRef = useRef(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const historyRef = useRef<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, []);

  // Abort in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const doStream = useCallback(
    async (allMessages: Message[]) => {
      setLoading(true);
      abortRef.current = new AbortController();

      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: "assistant", content: "", streaming: true },
      ]);

      let fullResponse = "";
      try {
        await streamChat(
          selectedModelRef.current,
          [SYSTEM_PROMPT, ...allMessages],
          (chunk) => {
            fullResponse += chunk;
            setMessages(updateLastMessage({ content: fullResponse, streaming: true }));
            scrollToBottom();
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
    },
    [scrollToBottom],
  );

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
  }, [loading, resetIdleTimer]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      const userMsg: Message = { role: "user", content: text };
      historyRef.current.push(userMsg);
      setMessages((prev) => [...prev, { id: nextId++, role: "user", content: text }]);
      scrollToBottom();

      await doStream(historyRef.current);
    },
    [doStream, scrollToBottom],
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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
      resetIdleTimer();
      const el = e.target;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    },
    [resetIdleTimer],
  );

  return (
    <>
      {sakuraPetals}
      <header className="header-border flex items-center gap-3 px-6 py-4 shrink-0 relative z-2 bg-linear-to-b from-surface to-transparent">
        <div className="size-[38px] rounded-full bg-user-gradient flex items-center justify-center shadow-pink shrink-0 animate-heartbeat">
          <div className="size-[18px] text-white fill-white opacity-90">{heartSvg}</div>
        </div>
        <div className="flex flex-col">
          <h1 className="header-title-text m-0 font-display text-[22px] font-medium text-sakura-deep tracking-[1px] leading-[1.2]">
            Fluffykins
          </h1>
          <span className="text-[10px] text-text-soft uppercase tracking-[4px] font-light">
            roleplay
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ModelPicker value={selectedModel} onChange={handleModelChange} isStreaming={loading} />
          {headerDeco}
        </div>
      </header>
      <div className="messages-scroll flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-4 scroll-smooth relative z-1">
        {messages.length === 0
          ? emptyState
          : messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-form px-5 pt-3 pb-5 shrink-0 relative z-2" onSubmit={handleSubmit}>
        <div className="input-row flex gap-2.5 items-end bg-surface border-2 border-border-pink rounded-3xl pl-5 p-1 transition-[border-color,box-shadow] duration-300 ease-in-out shadow-card">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none border-none py-2.5 px-0 font-body text-[14.5px] font-normal text-text-bright bg-transparent outline-none max-h-[200px] leading-[1.5] placeholder:text-sakura-light placeholder:font-light disabled:opacity-40"
            placeholder="Tell me a fantasy..."
            rows={1}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={loading}
            className={`size-[42px] rounded-full border-none bg-user-gradient text-white cursor-pointer flex items-center justify-center shrink-0 transition-[transform,box-shadow] duration-200 ease-in-out shadow-pink hover:enabled:scale-[1.08] hover:enabled:shadow-[0_4px_24px_rgba(236,112,153,0.35)] active:enabled:scale-[0.92] disabled:opacity-35 disabled:cursor-not-allowed ${loading ? "[&>svg]:animate-loading-bounce" : ""}`}
          >
            <div className="size-[18px]">{arrowSvg}</div>
          </button>
        </div>
      </form>
    </>
  );
}
