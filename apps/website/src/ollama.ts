const OLLAMA_BASE = "http://localhost:11434";
const MODEL = "leeplenty/ellaria:latest";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequest {
  model: string;
  messages: Message[];
  stream: true;
}

interface ChatChunk {
  message: { role: string; content: string };
  done: boolean;
}

export async function streamChat(
  messages: Message[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const body: ChatRequest = { model: MODEL, messages, stream: true };

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk: ChatChunk = JSON.parse(line);
      if (chunk.message.content) {
        onChunk(chunk.message.content);
      }
    }
  }

  if (buffer.trim()) {
    const chunk: ChatChunk = JSON.parse(buffer);
    if (chunk.message.content) {
      onChunk(chunk.message.content);
    }
  }
}
