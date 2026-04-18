import { useCallback, useEffect, useId, useRef, useState } from "react";
import { listModels } from "./ollama.ts";

type Status = "loading" | "ready" | "offline";

interface ModelPickerProps {
  value: string;
  onChange: (model: string) => void;
  isStreaming: boolean;
}

const chevronSvg = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

interface PrettyModel {
  name: string;
  tag: string | null;
}

function prettyModel(raw: string): PrettyModel {
  const nameAndTag = raw.split("/").pop() ?? raw;
  const colon = nameAndTag.indexOf(":");
  if (colon === -1) return { name: nameAndTag, tag: null };
  const name = nameAndTag.slice(0, colon);
  const tag = nameAndTag.slice(colon + 1);
  return { name, tag: tag === "latest" ? null : tag };
}

export function ModelPicker({ value, onChange, isStreaming }: ModelPickerProps) {
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pulseOnce, setPulseOnce] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const fetchModels = useCallback((signal?: AbortSignal) => {
    setStatus("loading");
    listModels(signal)
      .then((names) => {
        setModels(names);
        setStatus("ready");
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setStatus("offline");
      });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchModels(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchModels]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = models.indexOf(value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open, models, value]);

  const selectModel = useCallback(
    (model: string) => {
      if (model !== value) {
        onChange(model);
        setPulseOnce(true);
        setTimeout(() => setPulseOnce(false), 800);
      }
      setOpen(false);
      buttonRef.current?.focus();
    },
    [onChange, value],
  );

  const toggleOpen = useCallback(() => {
    if (status === "offline") {
      fetchModels();
      return;
    }
    setOpen((o) => !o);
  }, [fetchModels, status]);

  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (models.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % models.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + models.length) % models.length);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < models.length) {
          selectModel(models[activeIndex]);
        }
      }
    },
    [activeIndex, models, selectModel],
  );

  const displayed = prettyModel(value);
  const showHeartbeat = isStreaming || pulseOnce;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label="Choose model"
        className={`group flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-full bg-surface-pink border transition-[background,border-color,box-shadow,transform] duration-200 ease-out hover:bg-surface-lavender hover:scale-[1.02] focus:outline-none focus-visible:shadow-[var(--shadow-pink),0_0_0_4px_rgba(236,112,153,0.08)] ${open ? "border-sakura shadow-[var(--shadow-pink),0_0_0_4px_rgba(236,112,153,0.08)]" : "border-border-sakura"}`}
      >
        <span
          aria-hidden
          className={`block size-2 rounded-full bg-sakura-pale border-2 border-sakura-light ${showHeartbeat ? "animate-heartbeat" : ""}`}
        />
        <span className="font-body text-[11px] uppercase tracking-[2px] text-sakura-deep font-medium leading-none">
          {displayed.name}
        </span>
        <span
          aria-hidden
          className={`size-3.5 text-sakura transition-transform duration-300 ease-out ${open ? "rotate-180" : ""}`}
        >
          {chevronSvg}
        </span>
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Available models"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="absolute right-0 top-full mt-2 min-w-[220px] max-w-[280px] bg-surface border border-border-sakura rounded-2xl shadow-card z-10 overflow-hidden animate-fade-in-up-fast origin-top-right"
        >
          <div className="px-4 pt-3 pb-2">
            <p className="font-display italic text-xs tracking-wide text-sakura-deep m-0">
              choose your muse
            </p>
          </div>
          <div className="soft-divider mx-3" />

          {status === "loading" && (
            <div className="px-4 py-5 text-center">
              <p className="font-display italic text-sm text-text-soft m-0">listening...</p>
            </div>
          )}

          {status === "offline" && (
            <div className="px-4 py-5 text-center flex flex-col gap-2">
              <p className="font-display italic text-sm text-text-soft m-0">
                ollama is sleeping...
              </p>
              <button
                type="button"
                onClick={() => fetchModels()}
                className="font-display italic text-xs text-sakura hover:text-sakura-deep underline decoration-dotted underline-offset-4 bg-transparent border-none cursor-pointer"
              >
                try again
              </button>
            </div>
          )}

          {status === "ready" && models.length === 0 && (
            <div className="px-4 py-5 text-center">
              <p className="font-display italic text-sm text-text-soft m-0">
                no models to whisper with...
              </p>
            </div>
          )}

          {status === "ready" && models.length > 0 && (
            <ul
              role="none"
              className="py-1 m-0 list-none p-0 max-h-[300px] overflow-y-auto overflow-x-hidden"
            >
              {models.map((model, i) => {
                const pm = prettyModel(model);
                const selected = model === value;
                const active = i === activeIndex;
                return (
                  <li key={model} role="none" className="relative">
                    {i > 0 && <div className="soft-divider mx-4" />}
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => selectModel(model)}
                      onMouseEnter={() => setActiveIndex(i)}
                      style={{ animationDelay: `${i * 30}ms` }}
                      className={`group w-full flex items-center gap-3 px-4 py-2.5 text-left border-none cursor-pointer bg-transparent transition-[background,transform] duration-150 ease-out animate-fade-in-up-fast ${selected ? "model-row-selected" : ""} ${active && !selected ? "bg-surface-pink" : ""} ${!selected ? "hover:bg-surface-pink hover:translate-x-0.5" : ""}`}
                    >
                      <span
                        aria-hidden
                        className={`block size-2 rounded-full shrink-0 ${selected ? "bg-sakura border-2 border-sakura-deep" : "border border-sakura-light"}`}
                      />
                      <span
                        className={`font-display text-sm leading-tight ${selected ? "font-medium text-sakura-deep" : "text-text-bright"}`}
                      >
                        {pm.name}
                      </span>
                      {pm.tag && (
                        <span className="font-body text-[10px] text-text-soft tracking-[1px] uppercase ml-auto shrink-0">
                          {pm.tag}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
