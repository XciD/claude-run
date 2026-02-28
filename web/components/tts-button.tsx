import { useState, useRef, useCallback } from "react";
import { Volume2, Loader2, Pause } from "lucide-react";

const audioCache = new Map<string, string>();

interface TtsButtonProps {
  text: string;
}

export function TtsButton({ text }: TtsButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleClick = useCallback(async () => {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("idle");
      return;
    }

    if (state === "loading") return;

    const cacheKey = text.slice(0, 200);
    let blobUrl = audioCache.get(cacheKey);

    if (!blobUrl) {
      setState("loading");
      try {
        const resp = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          console.error("[tts]", err);
          setState("idle");
          return;
        }
        const blob = await resp.blob();
        blobUrl = URL.createObjectURL(blob);
        audioCache.set(cacheKey, blobUrl);
      } catch (e) {
        console.error("[tts]", e);
        setState("idle");
        return;
      }
    }

    const audio = new Audio(blobUrl);
    audioRef.current = audio;
    audio.onended = () => setState("idle");
    audio.onpause = () => {
      if (!audio.ended) setState("idle");
    };
    audio.play();
    setState("playing");
  }, [text, state]);

  const Icon = state === "loading" ? Loader2 : state === "playing" ? Pause : Volume2;

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading"}
      className="inline-flex items-center justify-center w-8 h-8 sm:w-6 sm:h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:cursor-wait"
      title={state === "playing" ? "Pause" : "Read aloud"}
    >
      <Icon size={14} className={`sm:w-3.5 sm:h-3.5 w-5 h-5 ${state === "loading" ? "animate-spin" : ""}`} />
    </button>
  );
}
