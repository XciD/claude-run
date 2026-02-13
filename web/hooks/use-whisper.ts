import { useState, useRef, useCallback } from "react";

type WhisperState = "idle" | "loading" | "recording" | "transcribing";

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const hasMediaDevices = !!navigator.mediaDevices?.getUserMedia;

// Show mic if we have either Web Speech API or getUserMedia (for Whisper)
export const micAvailable = !!SpeechRecognition || hasMediaDevices;

// --- Whisper (HTTPS only) ---

let pipelinePromise: Promise<any> | null = null;

function getTranscriber() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import(
        /* @vite-ignore */
        "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js"
      );
      env.backends.onnx.wasm.numThreads = 1;
      return pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
        dtype: "fp32",
      });
    })();
  }
  return pipelinePromise;
}

async function blobToFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  const pcm = decoded.getChannelData(0);
  await audioCtx.close();
  return pcm;
}

// --- Hook ---

export function useWhisper(onTranscript: (text: string) => void) {
  const [state, setState] = useState<WhisperState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  // Web Speech API path (works on HTTP in Safari, on-device)
  const startWebSpeech = useCallback(() => {
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      const text = transcript.trim();
      if (text) onTranscript(text);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setState("idle");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setState("idle");
    };

    recognition.start();
    setState("recording");
  }, [onTranscript]);

  const stopWebSpeech = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // Whisper path (HTTPS only, getUserMedia required)
  const startWhisper = useCallback(async () => {
    setState("loading");
    try {
      const transcriberP = getTranscriber();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      await transcriberP;
      setState("recording");

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) {
          setState("idle");
          return;
        }

        setState("transcribing");
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
          const pcm = await blobToFloat32(blob);
          const transcriber = await getTranscriber();
          const result = await transcriber(pcm);
          const text = (result as any).text?.trim();
          if (text) onTranscript(text);
        } catch (err) {
          console.error("Whisper transcription failed:", err);
        } finally {
          setState("idle");
        }
      };

      recorder.start();
    } catch (err) {
      console.error("Failed to start recording:", err);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setState("idle");
    }
  }, [onTranscript]);

  const stopWhisper = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  // Use Whisper when getUserMedia available, otherwise Web Speech API
  const useWebSpeech = !hasMediaDevices && !!SpeechRecognition;

  const toggle = useCallback(() => {
    if (state === "recording") {
      useWebSpeech ? stopWebSpeech() : stopWhisper();
    } else if (state === "idle") {
      useWebSpeech ? startWebSpeech() : startWhisper();
    }
  }, [state, useWebSpeech, startWebSpeech, stopWebSpeech, startWhisper, stopWhisper]);

  return { state, toggle };
}
