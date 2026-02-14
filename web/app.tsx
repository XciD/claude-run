import { useState, useEffect, useCallback, useMemo } from "react";
import type { Session } from "@claude-run/api";
import { PanelLeft, Plus, X, Bell, BellPlus, Square, Trash2, Loader2, ExternalLink } from "lucide-react";
import { formatTime } from "./utils";
import SessionList from "./components/session-list";
import SessionView from "./components/session-view";
import { useEventSource } from "./hooks/use-event-source";
import { usePush } from "./hooks/use-push";


interface SessionHeaderProps {
  session: Session;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)}KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)}MB`;
}

function SessionHeader(props: SessionHeaderProps) {
  const { session } = props;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded">
        {session.projectName}
      </span>
      {session.fileSize != null && (
        <span className="text-[10px] text-muted-foreground/60 bg-muted/60 px-1.5 py-0.5 rounded">
          {formatFileSize(session.fileSize)}
        </span>
      )}
    </div>
  );
}

interface AttentionSession {
  id: string;
  display: string;
  status: string;
  permissionMessage?: string;
  projectName?: string;
}

function AttentionIndicator({ sessions, onNavigate }: { sessions: AttentionSession[]; onNavigate: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  if (sessions.length === 0) return null;

  const permCount = sessions.filter(s => s.status === "permission").length;
  const notifCount = sessions.filter(s => s.status === "notification").length;
  const urgentCount = permCount + notifCount;

  const bellColor = permCount > 0
    ? "text-orange-400"
    : notifCount > 0
      ? "text-red-400"
      : sessions.some(s => s.status === "responding")
        ? "text-amber-400"
        : "text-green-400";

  const badgeColor = permCount > 0
    ? { ping: "bg-orange-400", solid: "bg-orange-500" }
    : { ping: "bg-red-400", solid: "bg-red-500" };

  return (
    <div className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="relative p-1 hover:bg-muted rounded transition-colors cursor-pointer"
        title={`${sessions.length} session${sessions.length > 1 ? "s" : ""} alive`}
      >
        <Bell className={`w-4 h-4 ${bellColor}`} />
        {urgentCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${badgeColor.ping} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${badgeColor.solid} text-[8px] text-white font-bold items-center justify-center`}>{urgentCount}</span>
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-64 bg-card border border-border rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto">
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => { onNavigate(s.id); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-muted transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {s.status === "permission" ? (
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse shrink-0" />
                  ) : s.status === "notification" ? (
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shrink-0" />
                  ) : s.status === "responding" ? (
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0" />
                  )}
                  <span className="text-[11px] text-foreground truncate">{s.display}</span>
                </div>
                {s.projectName && (
                  <p className="text-[10px] text-zinc-600 truncate mt-0.5 ml-3.5">{s.projectName}</p>
                )}
                {s.permissionMessage && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5 ml-3.5">{s.permissionMessage}</p>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatPct(v: number): string {
  return `${Math.round(v)}%`;
}

function pctColor(v: number): string {
  if (v > 80) return "text-rose-400";
  if (v >= 50) return "text-amber-400";
  return "text-muted-foreground";
}

function formatResetTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

function UsageBadge() {
  const [usage, setUsage] = useState<{ five_hour_pct: number; seven_day_pct: number; resets_at?: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchUsage = () => {
      fetch("/api/usage")
        .then((r) => r.json())
        .then((data) => {
          if (!mounted) return;
          if (data.five_hour_pct !== undefined) {
            setUsage(data);
            setError(false);
          } else {
            setError(true);
          }
        })
        .catch(() => { if (mounted) setError(true); });
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 60_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] shrink-0 border border-border rounded px-1.5 py-0.5 text-muted-foreground/60" title="Usage data unavailable">
        --/--
      </div>
    );
  }

  if (!usage) return null;

  const maxPct = Math.max(usage.five_hour_pct, usage.seven_day_pct);
  const borderColor = maxPct > 80 ? "border-rose-800/60" : maxPct >= 50 ? "border-amber-800/60" : "border-border";
  const resetLabel = usage.resets_at ? formatResetTime(usage.resets_at) : null;

  return (
    <div className={`flex items-center gap-1.5 text-[11px] shrink-0 border ${borderColor} rounded px-1.5 py-0.5`} title={`5h: ${formatPct(usage.five_hour_pct)} · 7d: ${formatPct(usage.seven_day_pct)}${resetLabel ? ` · resets ${resetLabel}` : ""}`}>
      <span className="text-muted-foreground/60">5h</span>
      <span className={pctColor(usage.five_hour_pct)}>{formatPct(usage.five_hour_pct)}</span>
      <span className="text-muted-foreground/60">7d</span>
      <span className={pctColor(usage.seven_day_pct)}>{formatPct(usage.seven_day_pct)}</span>
      {resetLabel && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-muted-foreground">{resetLabel}</span>
        </>
      )}
    </div>
  );
}

function PushButton() {
  const { state, subscribe } = usePush();

  // Hide when unsupported, denied, or already subscribed
  if (state !== "default" && state !== "subscribing") return null;

  return (
    <button
      onClick={subscribe}
      disabled={state === "subscribing"}
      className="p-1 hover:bg-muted rounded transition-colors cursor-pointer shrink-0"
      title="Enable push notifications"
    >
      <BellPlus className={`w-4 h-4 ${state === "subscribing" ? "text-muted-foreground/50 animate-pulse" : "text-muted-foreground"}`} />
    </button>
  );
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(() => {
    const hash = window.location.hash.slice(1);
    return hash || null;
  });
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [launchProject, setLaunchProject] = useState("");
  const [launchPrompt, setLaunchPrompt] = useState("");
  const [skipPermissions, setSkipPermissions] = useState(true);
  const [zellijSession, setZellijSession] = useState("");
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  const [zellijSessions, setZellijSessions] = useState<string[]>([]);
  const [launching, setLaunching] = useState(false);
  const [killing, setKilling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Ping server every 15s so it knows we're actively viewing
  useEffect(() => {
    fetch("/api/ping").catch(() => {});
    const id = setInterval(() => fetch("/api/ping").catch(() => {}), 15000);
    return () => clearInterval(id);
  }, []);

  // Clear app badge when app becomes visible
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) (navigator as any).clearAppBadge?.();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  const [resurrectData, setResurrectData] = useState<{ id: string; project: string; name?: string } | null>(null);
  const [resurrectSkip, setResurrectSkip] = useState(true);
  const [resurrecting, setResurrecting] = useState(false);

  const selectedSessionData = useMemo(() => {
    if (!selectedSession) {
      return null;
    }

    return sessions.find((s) => s.id === selectedSession) || null;
  }, [sessions, selectedSession]);

  // Find older sessions with the same slug (for plan navigation)
  const olderSlugSessions = useMemo(() => {
    if (!selectedSessionData?.slug) return [];
    return sessions
      .filter(s => s.slug === selectedSessionData.slug && s.id !== selectedSessionData.id)
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [sessions, selectedSessionData]);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then(setProjects)
      .catch(console.error);
  }, []);

  const handleSessionsFull = useCallback((event: MessageEvent) => {
    const data: Session[] = JSON.parse(event.data);
    setSessions(data);
    setLoading(false);
  }, []);

  const handleSessionsUpdate = useCallback((event: MessageEvent) => {
    const updates: Session[] = JSON.parse(event.data);
    setSessions((prev) => {
      const sessionMap = new Map(prev.map((s) => [s.id, s]));
      for (const update of updates) {
        sessionMap.set(update.id, update);
      }
      // Keep existing order for unchanged sessions, only insert new ones sorted
      const prevIds = new Set(prev.map(s => s.id));
      const newIds = updates.filter(u => !prevIds.has(u.id)).map(u => u.id);
      if (newIds.length === 0) {
        // Only updates, no new sessions — preserve order
        return prev.map(s => sessionMap.get(s.id) || s);
      }
      return Array.from(sessionMap.values()).sort(
        (a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id),
      );
    });
  }, []);

  const handleStatusUpdate = useCallback((event: MessageEvent) => {
    const data = JSON.parse(event.data);
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === data.id);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], status: data.status, paneId: data.paneId, paneVerified: data.paneVerified, permissionMessage: data.permissionMessage, questionData: data.questionData };
      return updated;
    });
  }, []);

  const handleSessionsError = useCallback(() => {
    setLoading(false);
  }, []);

  const handleOpenUrl = useCallback((event: MessageEvent) => {
    const { url } = JSON.parse(event.data);
    if (url) setPendingUrls((prev) => [...prev, url]);
  }, []);

  useEventSource("/api/sessions/stream", {
    events: [
      { eventName: "sessions", onMessage: handleSessionsFull },
      { eventName: "sessionsUpdate", onMessage: handleSessionsUpdate },
      { eventName: "statusUpdate", onMessage: handleStatusUpdate },
      { eventName: "openUrl", onMessage: handleOpenUrl },
    ],
    onError: handleSessionsError,
  });

  const attentionSessions = useMemo((): AttentionSession[] => {
    return sessions
      .filter(s => s.id !== selectedSession && s.status)
      .map(s => ({ id: s.id, display: s.display, status: s.status as string, permissionMessage: s.permissionMessage || undefined, projectName: s.projectName }));
  }, [sessions, selectedSession]);

  const filteredSessions = useMemo(() => {
    if (!selectedProject) {
      return sessions;
    }
    return sessions.filter((s) => s.project === selectedProject);
  }, [sessions, selectedProject]);

  // Listen for hash changes (e.g. from push notification click)
  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.slice(1);
      if (hash) setSelectedSession(hash);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  // Handle ?share= param from PWA share target
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("share");
    if (shared) {
      setLaunchPrompt(shared);
      setShowLaunchModal(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSession(sessionId);
    window.history.replaceState(null, "", `#${sessionId}`);
    if (window.innerWidth < 1024) {
      setSidebarCollapsed(true);
    }
  }, []);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (deleting) return;
      setDeleting(true);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          if (selectedSession === sessionId) {
            setSelectedSession(null);
            window.history.replaceState(null, "", window.location.pathname);
          }
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
      } finally {
        setDeleting(false);
      }
    },
    [selectedSession, deleting],
  );

  const handleResurrectSession = useCallback((sessionId: string, project: string, name?: string) => {
    setResurrectData({ id: sessionId, project, name });
    setResurrectSkip(true);
    fetch("/api/zellij/sessions").then(r => r.json()).then(d => {
      const sessions = d.sessions || [];
      setZellijSessions(sessions);
      if (!zellijSession && sessions.length > 0) setZellijSession(sessions[0]);
    }).catch(() => {});
  }, [zellijSession]);

  const handleResurrect = useCallback(async () => {
    if (!resurrectData) return;
    setResurrecting(true);
    try {
      const res = await fetch(`/api/sessions/${resurrectData.id}/resurrect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: resurrectData.project,
          dangerouslySkipPermissions: resurrectSkip || undefined,
          zellijSession: zellijSession || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResurrectData(null);
      }
    } catch (err) {
      console.error("Failed to resurrect session:", err);
    } finally {
      setResurrecting(false);
    }
  }, [resurrectData, resurrectSkip]);

  const handleLaunch = useCallback(async () => {
    setLaunching(true);
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: launchProject || undefined,
          prompt: launchPrompt || undefined,
          dangerouslySkipPermissions: skipPermissions || undefined,
          zellijSession: zellijSession || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowLaunchModal(false);
        setLaunchProject("");
        setLaunchPrompt("");
      }
    } catch (err) {
      console.error("Failed to launch agent:", err);
    } finally {
      setLaunching(false);
    }
  }, [launchProject]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {pendingUrls.map((url, i) => (
        <a
          key={`${url}-${i}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setPendingUrls((prev) => prev.filter((_, j) => j !== i))}
          className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors shrink-0"
        >
          <ExternalLink size={16} />
          <span className="truncate flex-1">{url}</span>
          <span
            role="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPendingUrls((prev) => prev.filter((_, j) => j !== i)); }}
            className="p-1 hover:bg-blue-700 rounded"
          >
            <X size={14} />
          </span>
        </a>
      ))}
      <div className="flex flex-1 min-h-0">
      {!sidebarCollapsed && (
        <aside className="w-80 border-r border-border flex flex-col bg-card max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:shadow-2xl">
          <div className="border-b border-border flex items-center">
            <label htmlFor={"select-project"} className="block flex-1 px-1 min-w-0">
              <select
                id={"select-project"}
                value={selectedProject || ""}
                onChange={(e) => setSelectedProject(e.target.value || null)}
                className="w-full h-[50px] bg-transparent text-foreground text-sm focus:outline-none cursor-pointer px-4 py-4"
              >
                <option value="">All Projects</option>
                {projects.map((project) => {
                  const name = project.split("/").pop() || project;
                  return (
                    <option key={project} value={project}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </label>
            <button
              onClick={() => {
                setLaunchProject(projects[0] || "");
                setShowLaunchModal(true);
                fetch("/api/zellij/sessions").then(r => r.json()).then(d => {
                  const sessions = d.sessions || [];
                  setZellijSessions(sessions);
                  if (!zellijSession && sessions.length > 0) setZellijSession(sessions[0]);
                }).catch(() => {});
              }}
              className="p-2 mr-2 hover:bg-muted rounded transition-colors cursor-pointer shrink-0"
              title="Launch new Claude agent"
            >
              <Plus className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <SessionList
            sessions={filteredSessions}
            selectedSession={selectedSession}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onResurrectSession={handleResurrectSession}
            loading={loading}
            selectedProject={selectedProject}
          />
        </aside>
      )}

      <main className="flex-1 overflow-hidden bg-background flex flex-col" onClick={() => { if (!sidebarCollapsed && window.innerWidth < 1024) setSidebarCollapsed(true); }}>
        <div className="border-b border-border px-3 py-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1 hover:bg-muted rounded transition-colors cursor-pointer shrink-0"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <PanelLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            {selectedSessionData && (
              <SessionHeader session={selectedSessionData} />
            )}
            <span className="flex-1" />
            <div className="flex items-center">
              <AttentionIndicator sessions={attentionSessions} onNavigate={handleSelectSession} />
              <PushButton />
            </div>
            <UsageBadge />
          </div>
          {selectedSessionData && (
            <div className="flex items-center gap-1.5 mt-1 pl-8">
              <span className="text-[11px] text-muted-foreground truncate flex-1">
                {selectedSessionData.summary || selectedSessionData.display}
              </span>
              {selectedSessionData.status ? (
                <button
                  disabled={killing}
                  onClick={async () => {
                    if (!confirm("Kill this session?")) return;
                    setKilling(true);
                    try {
                      await fetch(`/api/sessions/${selectedSessionData.id}/kill`, { method: "POST" });
                    } finally {
                      setKilling(false);
                    }
                  }}
                  className={`p-1 rounded transition-colors shrink-0 ${killing ? "cursor-not-allowed opacity-50" : "hover:bg-red-900/40 cursor-pointer"}`}
                  title="Kill session"
                >
                  {killing ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" /> : <Square className="w-3.5 h-3.5 text-red-400" />}
                </button>
              ) : (
                <button
                  disabled={deleting}
                  onClick={() => handleDeleteSession(selectedSessionData.id)}
                  className={`p-1 rounded transition-colors shrink-0 ${deleting ? "cursor-not-allowed opacity-50" : "hover:bg-red-900/40 cursor-pointer"}`}
                  title="Delete session"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          {selectedSession && selectedSessionData ? (
            <SessionView sessionId={selectedSession} session={selectedSessionData} onNavigateSession={handleSelectSession} olderSlugSessions={olderSlugSessions} onResurrect={() => {
              handleResurrectSession(selectedSessionData.id, selectedSessionData.project, selectedSessionData.summary || selectedSessionData.display);
            }} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground/60">
              <div className="text-center">
                <div className="text-base mb-2 text-muted-foreground">
                  Select a session
                </div>
                <div className="text-sm text-muted-foreground/60">
                  Choose a session from the list to view the conversation
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {resurrectData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setResurrectData(null)}>
          <div className="bg-card border border-border rounded-lg p-6 w-[420px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-foreground">Resume session</h2>
              <button onClick={() => setResurrectData(null)} className="p-1 hover:bg-muted rounded transition-colors cursor-pointer">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              {resurrectData.name && (
                <p className="text-sm text-foreground line-clamp-2">{resurrectData.name}</p>
              )}
              <div>
                <span className="block text-xs text-muted-foreground mb-1.5">Project</span>
                <span className="block text-sm text-foreground truncate">{resurrectData.project.split("/").pop()}</span>
              </div>
              {zellijSessions.length > 0 && (
                <div>
                  <label htmlFor="resurrect-zellij" className="block text-xs text-muted-foreground mb-1.5">Zellij session</label>
                  <select
                    id="resurrect-zellij"
                    value={zellijSession}
                    onChange={(e) => setZellijSession(e.target.value)}
                    className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                  >
                    {zellijSessions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resurrectSkip}
                  onChange={(e) => setResurrectSkip(e.target.checked)}
                  className="accent-muted-foreground"
                />
                <span className="text-xs text-muted-foreground">--dangerously-skip-permissions</span>
              </label>
              <button
                onClick={handleResurrect}
                disabled={resurrecting}
                className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resurrecting ? "Resuming..." : "Resume"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLaunchModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowLaunchModal(false)}>
          <div className="bg-card border border-border rounded-lg p-6 w-[420px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-foreground">Launch new agent</h2>
              <button onClick={() => setShowLaunchModal(false)} className="p-1 hover:bg-muted rounded transition-colors cursor-pointer">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="launch-project" className="block text-xs text-muted-foreground mb-1.5">Project</label>
                <select
                  id="launch-project"
                  value={launchProject}
                  onChange={(e) => setLaunchProject(e.target.value)}
                  className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                >
                  {projects.map((project) => {
                    const name = project.split("/").pop() || project;
                    return (
                      <option key={project} value={project}>{name}</option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label htmlFor="launch-prompt" className="block text-xs text-muted-foreground mb-1.5">Initial prompt (optional)</label>
                <textarea
                  id="launch-prompt"
                  value={launchPrompt}
                  onChange={(e) => setLaunchPrompt(e.target.value)}
                  placeholder="Say hi..."
                  rows={2}
                  className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring resize-none"
                />
              </div>
              {zellijSessions.length > 0 && (
                <div>
                  <label htmlFor="launch-zellij" className="block text-xs text-muted-foreground mb-1.5">Zellij session</label>
                  <select
                    id="launch-zellij"
                    value={zellijSession}
                    onChange={(e) => setZellijSession(e.target.value)}
                    className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                  >
                    {zellijSessions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipPermissions}
                  onChange={(e) => setSkipPermissions(e.target.checked)}
                  className="accent-muted-foreground"
                />
                <span className="text-xs text-muted-foreground">--dangerously-skip-permissions</span>
              </label>
              <button
                onClick={handleLaunch}
                disabled={launching}
                className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {launching ? "Launching..." : "Launch"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default App;
