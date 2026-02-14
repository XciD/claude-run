import { useEffect, useState, useRef, useCallback } from "react";
import type { ConversationMessage } from "@claude-run/api";
import MessageBlock from "./message-block";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/conversation";

const MAX_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

interface SessionViewProps {
  sessionId: string;
}

function SessionView(props: SessionViewProps) {
  const { sessionId } = props;

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const offsetRef = useRef(0);
  const retryCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/conversation/${sessionId}/stream?offset=${offsetRef.current}`
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("messages", (event) => {
      retryCountRef.current = 0;
      const newMessages: ConversationMessage[] = JSON.parse(event.data);
      setLoading(false);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.uuid).filter(Boolean));
        const unique = newMessages.filter((m) => !existingIds.has(m.uuid));
        if (unique.length === 0) {
          return prev;
        }
        offsetRef.current += unique.length;
        return [...prev, ...unique];
      });
    });

    eventSource.onerror = () => {
      eventSource.close();
      setLoading(false);

      if (!mountedRef.current) {
        return;
      }

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current), MAX_RETRY_DELAY_MS);
        retryCountRef.current++;
        retryTimeoutRef.current = setTimeout(() => connect(), delay);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setMessages([]);
    offsetRef.current = 0;
    retryCountRef.current = 0;

    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  const summary = messages.find((m) => m.type === "summary");
  const conversationMessages = messages.filter(
    (m) => m.type === "user" || m.type === "assistant"
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <Conversation className="h-full">
      <ConversationContent className="mx-auto max-w-3xl space-y-3 py-6">
        {summary && (
          <div className="rounded-lg border bg-card p-4 animate-fade-in">
            <h2 className="text-sm font-medium leading-relaxed">
              {summary.summary}
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {conversationMessages.length} messages
            </p>
          </div>
        )}

        {conversationMessages.map((message, index) => (
          <div key={message.uuid || index} className="animate-slide-up">
            <MessageBlock message={message} />
          </div>
        ))}
      </ConversationContent>

      <ConversationScrollButton />
    </Conversation>
  );
}

export default SessionView;
