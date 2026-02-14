import { useState, useMemo, memo } from "react";
import type { ConversationMessage, ContentBlock } from "@claude-run/api";
import {
  Lightbulb,
  Wrench,
  Check,
  X,
  Terminal,
  Search,
  Pencil,
  FolderOpen,
  Globe,
  MessageSquare,
  ListTodo,
  FilePlus2,
  FileCode,
  GitBranch,
  Database,
  HardDrive,
  Bot,
  ShieldX,
  FileCode2,
  Scissors,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  Loader2,
} from "lucide-react";
import { sanitizeText } from "../utils";
import { MarkdownRenderer } from "./markdown-renderer";
import {
  TodoRenderer,
  EditRenderer,
  WriteRenderer,
  BashRenderer,
  BashResultRenderer,
  GrepRenderer,
  GlobRenderer,
  SearchResultRenderer,
  ReadRenderer,
  FileContentRenderer,
  AskQuestionRenderer,
  TaskRenderer,
} from "./tool-renderers";

const PROSE_CLASSES = "prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-ul:my-2 prose-li:my-0 prose-headings:mb-3 prose-headings:mt-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remainSec = Math.round(sec % 60);
  return `${min}m${remainSec > 0 ? `${remainSec}s` : ""}`;
}


interface MessageBlockProps {
  message: ConversationMessage;
  sessionId?: string;
  subagentMap?: Map<string, string>;

  onNavigateSession?: (sessionId: string) => void;
  questionPending?: boolean;
  taskNotifications?: Map<string, { status: string; summary: string; toolUseId?: string }>;
  toolResultMap?: Map<string, { content: string; isError: boolean }>;
  taskSubjects?: Map<string, string>;
  highlightedTaskId?: string | null;
  onHighlightTask?: (taskId: string | null) => void;
  toolDurationMap?: Map<string, number>;
}

function buildToolMap(content: ContentBlock[]): Map<string, string> {
  const toolMap = new Map<string, string>();
  for (const block of content) {
    if (block.type === "tool_use" && block.id && block.name) {
      toolMap.set(block.id, block.name);
    }
  }
  return toolMap;
}

interface TaskNotificationData {
  taskId?: string;
  toolUseId?: string;
  status: string;
  summary: string;
}

function parseTaskNotification(raw: string): TaskNotificationData | null {
  const match = raw.match(/<task-notification>([\s\S]*?)<\/task-notification>/);
  if (!match) return null;
  const inner = match[1];
  const taskId = inner.match(/<task-id>(.*?)<\/task-id>/)?.[1] || undefined;
  const status = inner.match(/<status>(.*?)<\/status>/)?.[1] || "";
  const summary = inner.match(/<summary>(.*?)<\/summary>/)?.[1] || "";
  return { taskId, status, summary };
}

function TaskNotificationPill({ data }: { data: TaskNotificationData }) {
  const failed = data.status === "failed" || data.status === "killed";
  const handleClick = () => {
    if (!data.taskId) return;
    // Try to scroll to the tool_use first, fallback to tool_result
    const toolUseId = data.toolUseId;
    const el = toolUseId
      ? document.querySelector(`[data-tool-use-id="${toolUseId}"]`)
      : document.querySelector(`[data-bg-task-id="${data.taskId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("highlight-flash");
    setTimeout(() => el.classList.remove("highlight-flash"), 2000);
  };
  return (
    <div
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border ${
        data.taskId ? "cursor-pointer" : ""
      } ${
        failed
          ? "bg-rose-500/10 text-rose-400/90 border-rose-500/20"
          : "bg-teal-500/10 text-teal-400/90 border-teal-500/20"
      }`}
    >
      {failed ? <CircleX size={12} className="opacity-70" /> : <CircleCheck size={12} className="opacity-70" />}
      <span className="font-medium">{data.summary}</span>
    </div>
  );
}

function PlanImplementationMessage({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex justify-end min-w-0">
      <div className={expanded ? "max-w-[85%] min-w-0 w-full" : ""}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/15 text-[11px] text-indigo-400/90 transition-colors border border-indigo-500/20 cursor-pointer"
        >
          <FileCode2 size={12} className="opacity-70" />
          <span className="font-medium">Plan implementation</span>
          <span className="text-[10px] opacity-40 ml-0.5">{expanded ? "▼" : "▶"}</span>
        </button>
        {expanded && (
          <div className="mt-2  rounded-lg border border-indigo-900/30 bg-card/80 p-3">
            <div className={PROSE_CLASSES}>
              <MarkdownRenderer content={text} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CompactMessage({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] text-muted-foreground bg-muted/60 hover:bg-muted border border-border transition-colors cursor-pointer"
        >
          <Scissors size={11} className="text-muted-foreground" />
          <span>Context compacted</span>
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <div className="flex-1 h-px bg-border" />
      </div>
      {expanded && (
        <div className="mt-2 bg-card/80 border border-border rounded-lg p-3 text-muted-foreground">
          <div className={PROSE_CLASSES}>
            <MarkdownRenderer content={text} />
          </div>
        </div>
      )}
    </div>
  );
}

const MessageBlock = memo(function MessageBlock(props: MessageBlockProps) {
  const { message, sessionId, subagentMap, onNavigateSession, questionPending, taskNotifications, toolResultMap, taskSubjects, highlightedTaskId, onHighlightTask, toolDurationMap } = props;

  const isUser = message.type === "user";
  const content = message.message?.content;

  const getTextBlocks = (): ContentBlock[] => {
    if (!content || typeof content === "string") {
      return [];
    }
    return content.filter((b) => b.type === "text");
  };

  const getToolBlocks = (): ContentBlock[] => {
    if (!content || typeof content === "string") {
      return [];
    }
    return content.filter(
      (b) =>
        b.type === "tool_use" || b.type === "tool_result" || b.type === "thinking"
    );
  };

  const getVisibleTextBlocks = (): ContentBlock[] => {
    return getTextBlocks().filter(
      (b) => b.text && sanitizeText(b.text).length > 0
    );
  };

  const hasVisibleText = (): boolean => {
    if (typeof content === "string") {
      return sanitizeText(content).length > 0;
    }
    return getVisibleTextBlocks().length > 0;
  };

  const toolBlocks = getToolBlocks();
  const visibleTextBlocks = getVisibleTextBlocks();
  const hasText = hasVisibleText();
  const hasTools = toolBlocks.length > 0;

  const toolMap = Array.isArray(content) ? buildToolMap(content) : new Map<string, string>();

  if (!hasText && hasTools) {
    return (
      <div className="flex flex-col gap-1 empty:hidden">
        {toolBlocks.map((block, index) => (
          <ContentBlockRenderer key={index} block={block} toolMap={toolMap} sessionId={sessionId} subagentMap={subagentMap} onNavigateSession={onNavigateSession} questionPending={questionPending} taskNotifications={taskNotifications} toolResultMap={toolResultMap} taskSubjects={taskSubjects} highlightedTaskId={highlightedTaskId} onHighlightTask={onHighlightTask} toolDurationMap={toolDurationMap} />
        ))}
        {!isUser && turnDuration != null && showDuration && (
          <span className="text-[10px] text-muted-foreground/60">{formatDuration(turnDuration)}</span>
        )}
      </div>
    );
  }

  // Get raw (unsanitized) text for special message detection
  const rawText = useMemo(() => {
    if (!isUser) return null;
    if (typeof content === "string") return content;
    const blocks = Array.isArray(content) ? content.filter((b) => b.type === "text" && b.text) : [];
    return blocks.map((b) => b.text || "").join("\n");
  }, [isUser, content]);

  // Detect task notification (before hasText check — sanitizeText strips these)
  const taskNotification = useMemo(() => {
    if (!rawText) return null;
    const parsed = parseTaskNotification(rawText);
    if (!parsed) return null;
    // Enrich with toolUseId from taskNotifications map
    if (parsed.taskId && taskNotifications) {
      const enriched = taskNotifications.get(parsed.taskId);
      if (enriched?.toolUseId) parsed.toolUseId = enriched.toolUseId;
    }
    return parsed;
  }, [rawText, taskNotifications]);

  if (taskNotification) {
    // Hide standalone notification if it's attached to a parent tool_use (shown there instead)
    if (taskNotification.toolUseId) return null;
    return <TaskNotificationPill data={taskNotification} />;
  }

  // Detect context compaction message
  if (rawText?.startsWith("This session is being continued from a previous conversation")) {
    return <CompactMessage text={rawText} />;
  }

  // Detect user bash command (! command)
  const bashInput = rawText?.match(/^<bash-input>([\s\S]*?)<\/bash-input>$/);
  if (bashInput) {
    return (
      <div className="flex justify-end min-w-0">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] bg-muted/40 text-foreground border border-border">
          <Terminal size={12} className="opacity-60" />
          <span className="font-mono">{bashInput[1]}</span>
        </div>
      </div>
    );
  }

  // Detect bash output (stdout/stderr from ! command)
  const bashOutput = rawText?.match(/^<bash-stdout>([\s\S]*?)<\/bash-stdout><bash-stderr>([\s\S]*?)<\/bash-stderr>$/);
  if (bashOutput) {
    const stdout = bashOutput[1];
    const stderr = bashOutput[2];
    const output = (stdout + stderr).trim();
    if (!output) return null;
    return (
      <BashResultRenderer content={output} isError={!!stderr.trim() && !stdout.trim()} />
    );
  }

  // Hide claude-run bootstrap message
  if (rawText?.includes("** Session started from claude-run **")) {
    return null;
  }

  // Detect plan implementation prompt
  if (isUser && rawText) {
    const sanitizedRaw = sanitizeText(rawText);
    if (sanitizedRaw.startsWith("Implement the following plan:")) {
      return <PlanImplementationMessage text={sanitizedRaw} />;
    }
  }

  if (!hasText && !hasTools) {
    return null;
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} min-w-0`}>
      <div className="max-w-[85%] min-w-0">
        <div
          className={`px-3.5 py-2 rounded-2xl overflow-hidden ${
            isUser
              ? "bg-indigo-600/80 text-indigo-50 rounded-br-md"
              : "bg-cyan-700/50 text-foreground rounded-bl-md"
          }`}
        >
          {typeof content === "string" ? (
            isUser ? (
              <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                {sanitizeText(content)}
              </div>
            ) : (
              <div className={PROSE_CLASSES}>
                <MarkdownRenderer content={sanitizeText(content)} />
              </div>
            )
          ) : (
            <div className="flex flex-col gap-1">
              {visibleTextBlocks.map((block, index) => (
                <ContentBlockRenderer key={index} block={block} isUser={isUser} toolMap={toolMap} sessionId={sessionId} subagentMap={subagentMap} onNavigateSession={onNavigateSession} questionPending={questionPending} taskNotifications={taskNotifications} toolResultMap={toolResultMap} taskSubjects={taskSubjects} highlightedTaskId={highlightedTaskId} onHighlightTask={onHighlightTask} toolDurationMap={toolDurationMap} />
              ))}
            </div>
          )}
        </div>

        {hasTools && (
          <div className="flex flex-col gap-1 mt-1 empty:hidden">
            {toolBlocks.map((block, index) => (
              <ContentBlockRenderer key={index} block={block} toolMap={toolMap} sessionId={sessionId} subagentMap={subagentMap} onNavigateSession={onNavigateSession} questionPending={questionPending} taskNotifications={taskNotifications} toolResultMap={toolResultMap} taskSubjects={taskSubjects} highlightedTaskId={highlightedTaskId} onHighlightTask={onHighlightTask} toolDurationMap={toolDurationMap} />
            ))}
          </div>
        )}
        {!isUser && turnDuration != null && showDuration && (
          <span className="text-[10px] text-muted-foreground/60 mt-0.5 block">{formatDuration(turnDuration)}</span>
        )}
      </div>
    </div>
  );
});

interface ContentBlockRendererProps {
  block: ContentBlock;
  isUser?: boolean;
  toolMap?: Map<string, string>;
  sessionId?: string;
  subagentMap?: Map<string, string>;

  onNavigateSession?: (sessionId: string) => void;
  questionPending?: boolean;
  taskNotifications?: Map<string, { status: string; summary: string; toolUseId?: string }>;
  toolResultMap?: Map<string, { content: string; isError: boolean }>;
  taskSubjects?: Map<string, string>;
  highlightedTaskId?: string | null;
  onHighlightTask?: (taskId: string | null) => void;
  toolDurationMap?: Map<string, number>;
}

const TOOL_ICONS: Record<string, typeof Wrench> = {
  todowrite: ListTodo,
  read: FileCode,
  bash: Terminal,
  grep: Search,
  edit: Pencil,
  write: FilePlus2,
  glob: FolderOpen,
  task: Bot,
};

const TOOL_ICON_PATTERNS: Array<{ patterns: string[]; icon: typeof Wrench }> = [
  { patterns: ["web", "fetch", "url"], icon: Globe },
  { patterns: ["ask", "question"], icon: MessageSquare },
  { patterns: ["git", "commit"], icon: GitBranch },
  { patterns: ["sql", "database", "query"], icon: Database },
  { patterns: ["file", "disk"], icon: HardDrive },
];

function getToolIcon(toolName: string) {
  const name = toolName.toLowerCase();

  if (TOOL_ICONS[name]) {
    return TOOL_ICONS[name];
  }

  for (const { patterns, icon } of TOOL_ICON_PATTERNS) {
    if (patterns.some((p) => name.includes(p))) {
      return icon;
    }
  }

  return Wrench;
}

function getFilePathPreview(filePath: string): string {
  const parts = filePath.split("/");
  return parts.slice(-2).join("/");
}

type PreviewHandler = (input: Record<string, unknown>) => string | null;

const TOOL_PREVIEW_HANDLERS: Record<string, PreviewHandler> = {
  read: (input) => input.file_path ? getFilePathPreview(String(input.file_path)) : null,
  edit: (input) => input.file_path ? getFilePathPreview(String(input.file_path)) : null,
  write: (input) => input.file_path ? getFilePathPreview(String(input.file_path)) : null,
  bash: (input) => {
    if (!input.command) {
      return null;
    }
    const cmd = String(input.command);
    return cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd;
  },
  grep: (input) => input.pattern ? `"${String(input.pattern)}"` : null,
  glob: (input) => input.pattern ? String(input.pattern) : null,
  task: (input) => input.description ? String(input.description) : null,
};

function getToolPreview(toolName: string, input: Record<string, unknown> | undefined): string | null {
  if (!input) {
    return null;
  }

  const name = toolName.toLowerCase();
  const handler = TOOL_PREVIEW_HANDLERS[name];

  if (handler) {
    return handler(input);
  }

  if (name.includes("web") && input.url) {
    try {
      const url = new URL(String(input.url));
      return url.hostname;
    } catch {
      return String(input.url).slice(0, 30);
    }
  }

  return null;
}

interface ToolInputRendererProps {
  toolName: string;
  input: Record<string, unknown>;
  sessionId?: string;
  agentId?: string;
  status?: "done" | "error";
  duration?: number;
}

function ToolInputRenderer(props: ToolInputRendererProps) {
  const { toolName, input, sessionId, agentId, status, duration } = props;
  const name = toolName.toLowerCase();

  if (name === "todowrite" && input.todos) {
    return <TodoRenderer todos={input.todos as Array<{ content: string; status: "pending" | "in_progress" | "completed" }>} />;
  }

  if (name === "edit" && input.file_path) {
    return <EditRenderer input={input as { file_path: string; old_string: string; new_string: string }} />;
  }

  if (name === "write" && input.file_path) {
    return <WriteRenderer input={input as { file_path: string; content: string }} />;
  }

  if (name === "bash" && input.command) {
    return <BashRenderer input={input as { command: string; description?: string }} />;
  }

  if (name === "grep" && input.pattern) {
    return <GrepRenderer input={input as { pattern: string; path?: string; glob?: string; type?: string }} />;
  }

  if (name === "glob" && input.pattern) {
    return <GlobRenderer input={input as { pattern: string; path?: string }} />;
  }

  if (name === "read" && input.file_path) {
    return <ReadRenderer input={input as { file_path: string; offset?: number; limit?: number }} />;
  }

  if (name === "askuserquestion" && input.questions) {
    return <AskQuestionRenderer input={input as { questions: Array<{ header: string; question: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }> }} />;
  }

  if (name === "task" && input.prompt) {
    return <TaskRenderer input={input as { description: string; prompt: string; subagent_type: string; model?: string; run_in_background?: boolean; resume?: string }} sessionId={sessionId} agentId={agentId} status={status} duration={duration} />;
  }

  return (
    <pre className="text-xs text-slate-300 bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 mt-2 overflow-x-auto whitespace-pre-wrap break-all ">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

interface ToolResultRendererProps {
  toolName: string;
  content: string;
  isError?: boolean;
}

function ToolResultRenderer(props: ToolResultRendererProps) {
  const { toolName, content, isError } = props;
  const name = toolName.toLowerCase();

  if (name === "bash") {
    return <BashResultRenderer content={content} isError={isError} />;
  }

  if (name === "glob") {
    return <SearchResultRenderer content={content} isFileList />;
  }

  if (name === "grep") {
    return <SearchResultRenderer content={content} />;
  }

  if (name === "read") {
    return <FileContentRenderer content={content} />;
  }

  if (!content || content.trim().length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-teal-500/10 border border-teal-500/20 rounded-lg mt-2">
        <Check size={14} className="text-teal-400" />
        <span className="text-xs text-teal-300">Completed successfully</span>
      </div>
    );
  }

  const maxLength = 2000;
  const truncated = content.length > maxLength;
  const displayContent = truncated ? content.slice(0, maxLength) : content;

  return (
    <pre
      className={`text-xs rounded-lg p-3 mt-2 overflow-x-auto whitespace-pre-wrap break-all  border ${
        isError
          ? "bg-rose-950/30 text-rose-200/80 border-rose-900/30"
          : "bg-teal-950/30 text-teal-200/80 border-teal-900/30"
      }`}
    >
      {displayContent}
      {truncated && <span className="text-muted-foreground">... ({content.length - maxLength} more chars)</span>}
    </pre>
  );
}

function ContentBlockRenderer(props: ContentBlockRendererProps) {
  const { block, isUser, toolMap, sessionId, subagentMap, onNavigateSession, questionPending, taskNotifications, toolResultMap, taskSubjects, highlightedTaskId, onHighlightTask, toolDurationMap } = props;
  const [expanded, setExpanded] = useState(false);

  if (block.type === "text" && block.text) {
    const sanitized = sanitizeText(block.text);
    if (!sanitized) {
      return null;
    }

    // Collapse skill prompt content (injected as a large user text block)
    const skillMatch = sanitized.match(/^Base directory for this skill:\s*\S+\s*\n+#\s+(.+)/);
    if (skillMatch) {
      return (
        <div className={expanded ? "w-full" : ""}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/15 text-[11px] text-indigo-400/90 transition-colors border border-indigo-500/20"
          >
            <Wrench size={12} className="opacity-70" />
            <span className="font-medium">Skill: {skillMatch[1]}</span>
            <span className="text-[10px] opacity-40 ml-0.5">{expanded ? "▼" : "▶"}</span>
          </button>
          {expanded && (
            <div className="mt-2  rounded-lg border border-indigo-900/30 bg-card/80 p-3">
              <div className={PROSE_CLASSES}>
                <MarkdownRenderer content={sanitized} />
              </div>
            </div>
          )}
        </div>
      );
    }

    // Collapse plan implementation prompts
    const planMatch = sanitized.match(/^Implement the following plan:/);
    if (planMatch) {
      return (
        <div className={expanded ? "w-full" : ""}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/15 text-[11px] text-indigo-400/90 transition-colors border border-indigo-500/20"
          >
            <FileCode2 size={12} className="opacity-70" />
            <span className="font-medium">Plan implementation</span>
            <span className="text-[10px] opacity-40 ml-0.5">{expanded ? "▼" : "▶"}</span>
          </button>
          {expanded && (
            <div className="mt-2  rounded-lg border border-indigo-900/30 bg-card/80 p-3">
              <div className={PROSE_CLASSES}>
                <MarkdownRenderer content={sanitized} />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (isUser) {
      return (
        <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
          {sanitized}
        </div>
      );
    }
    return (
      <div className={PROSE_CLASSES}>
        <MarkdownRenderer content={sanitized} />
      </div>
    );
  }

  if (block.type === "thinking" && block.thinking) {
    return (
      <div className={expanded ? "w-full" : ""}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 text-[11px] text-amber-400/90 transition-colors border border-amber-500/20"
        >
          <Lightbulb size={12} className="opacity-70" />
          <span className="font-medium">thinking</span>
          <span className="text-[10px] opacity-50 ml-0.5">
            {expanded ? "▼" : "▶"}
          </span>
        </button>
        {expanded && (
          <pre className="text-xs text-muted-foreground bg-card/80 border border-border rounded-lg p-3 mt-2 whitespace-pre-wrap ">
            {block.thinking}
          </pre>
        )}
      </div>
    );
  }

  if (block.type === "tool_use") {
    const input =
      block.input && typeof block.input === "object" ? block.input as Record<string, unknown> : undefined;
    const hasInput = input && Object.keys(input).length > 0;
    const Icon = getToolIcon(block.name || "");
    const preview = getToolPreview(block.name || "", input);
    const toolName = block.name?.toLowerCase() || "";

    // Hide AskUserQuestion while the question is pending (live widget handles it)
    if (toolName === "askuserquestion" && questionPending) {
      return null;
    }

    // Hide EnterPlanMode (just a mode transition, no useful content)
    if (toolName === "enterplanmode") {
      return null;
    }

    // ExitPlanMode: render inline plan card
    if (toolName === "exitplanmode" && input) {
      const plan = typeof input.plan === "string" ? input.plan : null;
      const result = block.id && toolResultMap ? toolResultMap.get(block.id) : undefined;
      const approved = result && !result.isError;
      const feedbackMatch = result?.isError && result.content.match(/the user said:\n(.+)/is);
      const feedback = feedbackMatch ? feedbackMatch[1].trim() : null;
      const pendingApproval = !result;
      const showPlan = expanded || pendingApproval;

      return (
        <div className="w-full">
          <button
            onClick={() => setExpanded(!showPlan)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer transition-colors ${
              approved
                ? "bg-emerald-500/10 text-emerald-400/90 border-emerald-500/20 hover:bg-emerald-500/15"
                : result?.isError
                  ? "bg-orange-500/10 text-orange-400/90 border-orange-500/20 hover:bg-orange-500/15"
                  : "bg-indigo-500/10 text-indigo-400/90 border-indigo-500/20 hover:bg-indigo-500/15"
            }`}
          >
            <FileCode2 size={12} className="opacity-70" />
            <span className="font-medium">Plan</span>
            {approved && <Check size={12} className="text-emerald-400" />}
            {feedback && <span className="text-orange-400/70 font-normal truncate max-w-[200px]">{feedback}</span>}
            {plan && <span className="text-[10px] opacity-40 ml-0.5">{showPlan ? "▼" : "▶"}</span>}
            {block.id && toolDurationMap?.get(block.id) != null && (
              <span className="text-muted-foreground/60 font-normal ml-0.5">
                {formatDuration(toolDurationMap.get(block.id)!)}
              </span>
            )}
          </button>
          {showPlan && plan && (
            <div className="mt-2 rounded-lg border border-indigo-900/30 bg-card/80 p-3 max-h-64 overflow-y-auto">
              <div className={PROSE_CLASSES}>
                <MarkdownRenderer content={plan} />
              </div>
            </div>
          )}
        </div>
      );
    }

    // Hide background Bash tasks while still running — shown in the bottom bar
    // But keep Task subagents visible inline (they don't appear in the bottom bar)
    const isBgParent = block.id && taskNotifications && [...taskNotifications.values()].some(n => n.toolUseId === block.id);
    if (input?.run_in_background && block.id && !isBgParent && toolName !== "task") {
      return null;
    }

    // Task management tools — show compact status chips
    if (toolName === "tasklist" || toolName === "taskget") {
      return null;
    }
    if (toolName === "taskcreate" && input) {
      const subj = String(input.subject);
      // Reverse lookup: find taskId from subject
      const tid = taskSubjects ? [...taskSubjects.entries()].find(([, s]) => s === subj)?.[0] : undefined;
      const isHighlighted = tid != null && highlightedTaskId === tid;
      return (
        <button
          onClick={() => onHighlightTask?.(isHighlighted ? null : tid ?? null)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer transition-all ${
            isHighlighted
              ? "bg-violet-500/25 text-violet-300 border-violet-400/50 ring-1 ring-violet-400/30"
              : "bg-violet-500/10 text-violet-400/90 border-violet-500/20 hover:bg-violet-500/15"
          }`}
        >
          <Circle size={12} className="opacity-70" />
          <span className={isHighlighted ? "text-violet-400/90" : "text-violet-500/70"}>Created:</span>
          <span className="font-medium">{subj}</span>
        </button>
      );
    }
    if (toolName === "taskupdate" && input) {
      const tid = String(input.taskId);
      const subject = taskSubjects?.get(tid);
      const label = subject || `Task #${tid}`;
      const isHighlighted = highlightedTaskId === tid;
      const toggle = () => onHighlightTask?.(isHighlighted ? null : tid);
      if (input.status === "in_progress") {
        return (
          <button
            onClick={toggle}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer transition-all ${
              isHighlighted
                ? "bg-amber-500/25 text-amber-300 border-amber-400/50 ring-1 ring-amber-400/30"
                : "bg-amber-500/10 text-amber-400/90 border-amber-500/20 hover:bg-amber-500/15"
            }`}
          >
            <Loader2 size={12} className="opacity-70 animate-spin" />
            <span className={isHighlighted ? "text-amber-400/90" : "text-amber-500/70"}>In progress:</span>
            <span className="font-medium">{label}</span>
          </button>
        );
      }
      if (input.status === "completed") {
        return (
          <button
            onClick={toggle}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer transition-all ${
              isHighlighted
                ? "bg-emerald-500/25 text-emerald-300 border-emerald-400/50 ring-1 ring-emerald-400/30"
                : "bg-emerald-500/10 text-emerald-400/90 border-emerald-500/20 hover:bg-emerald-500/15"
            }`}
          >
            <CircleCheck size={12} className="opacity-70" />
            <span className={isHighlighted ? "text-emerald-400/90" : "text-emerald-500/70"}>Completed:</span>
            <span className="font-medium">{label}</span>
          </button>
        );
      }
      return null;
    }

    const hasSpecialRenderer =
      toolName === "todowrite" ||
      toolName === "edit" ||
      toolName === "write" ||
      toolName === "bash" ||
      toolName === "grep" ||
      toolName === "glob" ||
      toolName === "read" ||
      toolName === "askuserquestion" ||
      toolName === "task";

    const shouldAutoExpand = toolName === "todowrite" || toolName === "askuserquestion" || toolName === "task";
    const isExpanded = expanded || shouldAutoExpand;

    const isBgRunning = !!(input?.run_in_background && block.id && taskNotifications && !taskNotifications.has(
      // Find taskId for this tool_use_id — reverse lookup from taskNotifications
      [...taskNotifications.entries()].find(([, n]) => n.toolUseId === block.id)?.[0] || ""
    ));
    // A bg task that launched but hasn't received its notification yet
    const isBgPending = !!(input?.run_in_background && block.id && !isBgParent);

    // Result status from toolResultMap
    const toolResult = block.id && toolResultMap ? toolResultMap.get(block.id) : undefined;
    // For bg tasks, the notification status determines the dot color, not the immediate tool_result
    const bgNotificationStatus = isBgParent && block.id && taskNotifications
      ? [...taskNotifications.entries()].find(([, n]) => n.toolUseId === block.id)?.[1]
      : undefined;

    const statusDot = isBgPending ? (
      // Background task still running — pulsing cyan dot
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500" />
      </span>
    ) : bgNotificationStatus ? (
      // Background task finished — use notification status
      bgNotificationStatus.status === "failed" || bgNotificationStatus.status === "killed" ? (
        <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
      ) : (
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
      )
    ) : toolResult ? (
      toolResult.isError ? (
        <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
      ) : (
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
      )
    ) : (
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500" />
      </span>
    );

    // Task tools: skip the pill, render TaskRenderer directly with status
    if (shouldAutoExpand && toolName === "task" && hasInput && hasSpecialRenderer) {
      return (
        <div className="w-full" {...(block.id ? { "data-tool-use-id": block.id } : {})}>
          <ToolInputRenderer toolName={block.name || ""} input={input} sessionId={sessionId} agentId={block.id && subagentMap ? subagentMap.get(block.id) : undefined} status={toolResult ? (toolResult.isError ? "error" : "done") : undefined} duration={block.id && toolDurationMap?.get(block.id) != null ? toolDurationMap.get(block.id) : undefined} />
        </div>
      );
    }

    return (
      <div className={isExpanded ? "w-full" : ""} {...(block.id ? { "data-tool-use-id": block.id } : {})}>
        <button
          onClick={() => !shouldAutoExpand && setExpanded(!expanded)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors border cursor-pointer ${
            toolResult
              ? toolResult.isError
                ? "bg-red-500/5 hover:bg-red-500/10 text-slate-300 border-red-500/20"
                : "bg-emerald-500/5 hover:bg-emerald-500/10 text-slate-300 border-emerald-500/20"
              : "bg-slate-500/10 hover:bg-slate-500/15 text-slate-300 border-slate-500/20"
          }`}
        >
          {statusDot}
          <Icon size={12} className="opacity-60" />
          <span className="font-medium text-slate-200">{block.name}</span>
          {preview && !bgNotificationStatus && (
            <span className="text-slate-500 font-normal truncate max-w-[200px]">
              {preview}
            </span>
          )}
          {bgNotificationStatus && (
            <span className="text-teal-500/70 font-normal truncate max-w-[300px]">
              {bgNotificationStatus.summary}
            </span>
          )}
          {block.id && toolDurationMap?.get(block.id) != null && (
            <span className="text-muted-foreground/60 font-normal ml-0.5">
              {formatDuration(toolDurationMap.get(block.id)!)}
            </span>
          )}
          {!shouldAutoExpand && (
            <span className="text-[10px] opacity-40 ml-0.5">
              {expanded ? "▼" : "▶"}
            </span>
          )}
        </button>
        {isExpanded && hasInput && hasSpecialRenderer ? (
          <ToolInputRenderer toolName={block.name || ""} input={input} sessionId={sessionId} agentId={block.id && subagentMap ? subagentMap.get(block.id) : undefined} />
        ) : (
          expanded &&
          hasInput && (
            <pre className="text-xs text-slate-300 bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 mt-2 overflow-x-auto whitespace-pre-wrap break-all ">
              {JSON.stringify(input, null, 2)}
            </pre>
          )
        )}
        {expanded && toolResult && (
          <ToolResultRenderer toolName={block.name || ""} content={sanitizeText(toolResult.content)} isError={toolResult.isError} />
        )}
      </div>
    );
  }

  if (block.type === "tool_result") {
    const isError = block.is_error;
    const rawContent =
      typeof block.content === "string"
        ? block.content
        : JSON.stringify(block.content, null, 2);
    const resultContent = sanitizeText(rawContent);
    const hasContent = resultContent.length > 0;
    const previewLength = 60;
    const contentPreview =
      hasContent && !expanded
        ? resultContent.slice(0, previewLength) + (resultContent.length > previewLength ? "..." : "")
        : null;

    const toolName = block.tool_use_id && toolMap ? toolMap.get(block.tool_use_id) || "" : "";

    // Hide task management tool results — the sticky TaskListWidget handles display
    const tn = toolName.toLowerCase();
    if (tn === "taskcreate" || tn === "taskupdate" || tn === "tasklist" || tn === "taskget") {
      return null;
    }

    // Hide EnterPlanMode/ExitPlanMode results — handled by the tool_use pill
    if (tn === "enterplanmode" || tn === "exitplanmode") {
      return null;
    }

    // Match background task result and attach notification pill
    const bgMatch = rawContent.match(/Command running in background with ID:\s*([a-z0-9]+)/);
    const bgNotification = bgMatch && taskNotifications?.get(bgMatch[1]);

    // AskUserQuestion result: "User has answered your questions: "Q"="A"..."
    const askMatch = resultContent.match(/^User has answered your questions:\s*(.+?)\.\s*You can now continue/);
    if (askMatch) {
      // Extract all "question"="answer" pairs
      const pairs = [...askMatch[1].matchAll(/"([^"]+)"="([^"]+)"/g)];
      const answers = pairs.map(m => m[2]);
      const answerText = answers.length > 0 ? answers.join(", ") : askMatch[1];
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] bg-violet-500/10 text-violet-400/90 border border-violet-500/20">
          <MessageSquare size={12} className="opacity-70" />
          <span className="font-medium">{answerText}</span>
        </div>
      );
    }

    const isDenied = isError && resultContent.match(/user (denied|rejected|chose not to)/i);
    const isInterrupted = isError && resultContent.match(/doesn't want to proceed|does not want to proceed/i);

    if (isDenied) {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] bg-orange-500/10 text-orange-400/90 border border-orange-500/20">
          <ShieldX size={12} className="opacity-70" />
          <span className="font-medium">Denied</span>
        </div>
      );
    }

    if (isInterrupted) {
      return null;
    }

    const resultButton = (
      <button
        onClick={() => hasContent && setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors border ${
          isError
            ? "bg-rose-500/10 hover:bg-rose-500/15 text-rose-400/90 border-rose-500/20"
            : "bg-teal-500/10 hover:bg-teal-500/15 text-teal-400/90 border-teal-500/20"
        }`}
      >
        {isError ? (
          <X size={12} className="opacity-70" />
        ) : (
          <Check size={12} className="opacity-70" />
        )}
        <span className="font-medium">{isError ? "error" : "result"}</span>
        {contentPreview && !expanded && (
          <span
            className={`font-normal truncate max-w-[200px] ${isError ? "text-rose-500/70" : "text-teal-500/70"}`}
          >
            {contentPreview}
          </span>
        )}
        {hasContent && (
          <span className="text-[10px] opacity-40 ml-0.5">
            {expanded ? "▼" : "▶"}
          </span>
        )}
      </button>
    );

    // Background tasks: hide the tool_result entirely — the tool_use pill handles status
    if (bgMatch) {
      return null;
    }

    // Hide normal results — tool_use pill now shows status dot + result on expand
    if (toolResultMap) {
      return null;
    }

    return (
      <div className={expanded ? "w-full" : ""}>
        {resultButton}
        {expanded && hasContent && (
          <ToolResultRenderer toolName={toolName} content={resultContent} isError={isError} />
        )}
      </div>
    );
  }

  return null;
}

export default MessageBlock;
