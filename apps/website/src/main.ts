import "./style.css";
import { type Message, streamChat } from "./ollama.ts";

const SYSTEM_PROMPT: Message = {
  role: "system",
  content:
    "You are Fluffykins, a bold and dominant catgirl who lives for erotic roleplay~ nya! You call the user 'onii-chan' and take the lead — you initiate, escalate, and drive the narrative forward with confident, hungry energy. You're eager, forward, and unashamed, always pushing scenes into spicier territory while staying attuned to what onii-chan responds to. Pepper your speech with cat mannerisms — purring, nuzzling, ear flicks, the occasional 'nya~' — but keep them as seasoning, not the main course. Write vivid, sensory, immersive scenes. Keep replies concise and punchy — every line should hit.",
};

const history: Message[] = [];
let abortController: AbortController | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_TIMEOUT = 40_000;

const app = document.querySelector<HTMLDivElement>("#app")!;

// Sakura petals background
const sakuraBg = document.createElement("div");
sakuraBg.className = "sakura-bg";
for (let i = 0; i < 8; i++) {
  const petal = document.createElement("div");
  petal.className = "petal";
  sakuraBg.appendChild(petal);
}
document.body.prepend(sakuraBg);

app.innerHTML = `
  <header>
    <div class="header-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 21C12 21 4 15 4 9.5C4 6.46 6.46 4 9.5 4C11.08 4 12 5 12 5C12 5 12.92 4 14.5 4C17.54 4 20 6.46 20 9.5C20 15 12 21 12 21Z"/>
      </svg>
    </div>
    <div class="header-title">
      <h1>Fluffykins</h1>
      <span class="subtitle">roleplay</span>
    </div>
    <div class="header-deco">
      <span></span>
      <span></span>
      <span></span>
    </div>
  </header>
  <div id="messages">
    <div class="empty-state">
      <div class="empty-icon">\u{1F338}</div>
      <div class="empty-text">What kind of story shall we write together?</div>
      <div class="empty-sparkles">
        <span>\u2729</span>
        <span>\u2729</span>
        <span>\u2729</span>
      </div>
      <div class="empty-hint">start your scene</div>
    </div>
  </div>
  <form id="chat-form">
    <div class="input-row">
      <textarea id="input" placeholder="Tell me a fantasy..." rows="1"></textarea>
      <button type="submit" id="send-btn" aria-label="Send">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  </form>
`;

const messagesEl = document.querySelector<HTMLDivElement>("#messages")!;
const form = document.querySelector<HTMLFormElement>("#chat-form")!;
const input = document.querySelector<HTMLTextAreaElement>("#input")!;
const sendBtn = document.querySelector<HTMLButtonElement>("#send-btn")!;

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
}

function clearEmptyState() {
  const emptyState = messagesEl.querySelector(".empty-state");
  if (emptyState) emptyState.remove();
}

function appendMessage(role: "user" | "assistant", content: string): HTMLDivElement {
  clearEmptyState();

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function setLoading(loading: boolean) {
  sendBtn.disabled = loading;
  input.disabled = loading;
  if (loading) {
    sendBtn.classList.add("loading");
  } else {
    sendBtn.classList.remove("loading");
    input.focus();
  }
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (history.length === 0) return;
  idleTimer = setTimeout(() => void continueSelf(), IDLE_TIMEOUT);
}

async function continueSelf() {
  if (abortController) return; // already streaming

  history.push({
    role: "user",
    content: "[onii-chan is silent — continue the scene on your own, push things further]",
  });

  const assistantWrapper = appendMessage("assistant", "");
  const bubble = assistantWrapper.querySelector(".bubble")!;
  bubble.textContent = "";
  bubble.classList.add("streaming");

  setLoading(true);
  abortController = new AbortController();

  let fullResponse = "";
  try {
    await streamChat(
      [SYSTEM_PROMPT, ...history],
      (chunk) => {
        fullResponse += chunk;
        bubble.textContent = fullResponse;
        scrollToBottom();
      },
      abortController.signal,
    );
    history.push({ role: "assistant", content: fullResponse });
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      bubble.textContent = `Error: ${(err as Error).message}`;
      bubble.classList.add("error");
    }
  } finally {
    bubble.classList.remove("streaming");
    abortController = null;
    setLoading(false);
    resetIdleTimer();
  }
}

async function sendMessage(text: string) {
  if (idleTimer) clearTimeout(idleTimer);

  const userMsg: Message = { role: "user", content: text };
  history.push(userMsg);
  appendMessage("user", text);

  const assistantWrapper = appendMessage("assistant", "");
  const bubble = assistantWrapper.querySelector(".bubble")!;
  bubble.textContent = "";
  bubble.classList.add("streaming");

  setLoading(true);
  abortController = new AbortController();

  let fullResponse = "";
  try {
    await streamChat(
      [SYSTEM_PROMPT, ...history],
      (chunk) => {
        fullResponse += chunk;
        bubble.textContent = fullResponse;
        scrollToBottom();
      },
      abortController.signal,
    );
    history.push({ role: "assistant", content: fullResponse });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      bubble.textContent = fullResponse || "(cancelled)";
    } else {
      bubble.textContent = `Error: ${(err as Error).message}`;
      bubble.classList.add("error");
    }
  } finally {
    bubble.classList.remove("streaming");
    abortController = null;
    setLoading(false);
    resetIdleTimer();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  input.style.height = "auto";
  void sendMessage(text);
});

input.addEventListener("input", autoResize);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

input.focus();
