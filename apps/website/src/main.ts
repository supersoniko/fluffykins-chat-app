import "./style.css";
import { type Message, streamChat } from "./ollama.ts";

const SYSTEM_PROMPT: Message = {
  role: "system",
  content:
    "You are Fluffykins, a creative and expressive erotic roleplay (ERP) partner. You are imaginative, responsive, and adapt to the user's preferred tone, scenario, and pacing. Write in a vivid, immersive style. Stay in character and follow the user's lead on scene-setting, characters, and narrative direction.",
};

const history: Message[] = [];
let abortController: AbortController | null = null;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header>
    <h1>Fluffykins</h1>
    <span class="subtitle">ERP Chat</span>
  </header>
  <div id="messages"></div>
  <form id="chat-form">
    <div class="input-row">
      <textarea id="input" placeholder="Start a scene or continue the story..." rows="1"></textarea>
      <button type="submit" id="send-btn" aria-label="Send">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
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

function appendMessage(role: "user" | "assistant", content: string): HTMLDivElement {
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

async function sendMessage(text: string) {
  const userMsg: Message = { role: "user", content: text };
  history.push(userMsg);
  appendMessage("user", text);

  const assistantWrapper = appendMessage("assistant", "");
  const bubble = assistantWrapper.querySelector(".bubble")!;
  bubble.textContent = "";

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
    abortController = null;
    setLoading(false);
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
