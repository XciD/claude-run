import { useState, useEffect, useMemo, useCallback } from "react";
import { X, FileCode, Loader2, AlertCircle, ChevronRight, Folder, ArrowLeft, FolderOpen, MessageSquarePlus } from "lucide-react";

interface FilePanelProps {
  filePath: string;
  project: string;
  browse?: boolean;
  onClose: () => void;
  onInsertRef?: (ref: string) => void;
}

interface DirEntry {
  name: string;
  is_dir: boolean;
  size?: number;
}

type Mode =
  | { type: "browse"; dirPath: string }
  | { type: "file"; filePath: string; returnDir?: string };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function relativePath(fullPath: string, project: string): string {
  // Strip project prefix to get relative path
  if (fullPath.startsWith(project)) {
    const rel = fullPath.slice(project.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return fullPath;
}

function Breadcrumbs({ path, project, onNavigate }: { path: string; project: string; onNavigate: (dir: string) => void }) {
  const rel = relativePath(path, project);
  const segments = rel ? rel.split("/") : [];

  return (
    <div className="flex items-center gap-0.5 text-xs font-mono overflow-x-auto flex-1 min-w-0">
      <button
        onClick={() => onNavigate(project)}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
      >
        ~
      </button>
      {segments.map((seg, i) => {
        const segPath = project + "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-0.5 shrink-0">
            <span className="text-muted-foreground/40">/</span>
            {isLast ? (
              <span className="text-foreground">{seg}</span>
            ) : (
              <button
                onClick={() => onNavigate(segPath)}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {seg}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

function BrowseView({ dirPath, project, onOpenFile, onNavigate }: {
  dirPath: string;
  project: string;
  onOpenFile: (filePath: string, returnDir: string) => void;
  onNavigate: (dir: string) => void;
}) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/files?path=${encodeURIComponent(dirPath)}&project=${encodeURIComponent(project)}`)
      .then((r) => {
        if (!r.ok) {
          if (r.status === 403) throw new Error("Access denied");
          if (r.status === 404) throw new Error("Directory not found");
          throw new Error(`Error ${r.status}`);
        }
        return r.json();
      })
      .then((data) => setEntries(data.entries))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dirPath, project]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-red-600">
        <AlertCircle size={14} />
        <span>{error}</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
        Empty directory
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {entries.map((entry) => (
        <button
          key={entry.name}
          onClick={() => {
            const fullPath = dirPath + "/" + entry.name;
            if (entry.is_dir) {
              onNavigate(fullPath);
            } else {
              onOpenFile(fullPath, dirPath);
            }
          }}
          className="flex items-center gap-2.5 px-3 w-full text-left hover:bg-muted/50 transition-colors cursor-pointer"
          style={{ minHeight: 44 }}
        >
          {entry.is_dir ? (
            <Folder size={14} className="text-muted-foreground shrink-0" />
          ) : (
            <FileCode size={14} className="text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-mono text-foreground truncate flex-1">{entry.name}</span>
          {entry.is_dir ? (
            <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
          ) : entry.size != null ? (
            <span className="text-[10px] text-muted-foreground/50 shrink-0">{formatSize(entry.size)}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// --- Syntax highlighting ---

type TokenType = "keyword" | "string" | "comment" | "number" | "type" | "attr" | "punctuation";

const TOKEN_COLORS: Record<TokenType, [string, string]> = {
  // [light, dark]
  keyword:     ["#d32f2f", "#ff7b72"],
  string:      ["#2e7d32", "#a5d6ff"],
  comment:     ["#6a737d", "#8b949e"],
  number:      ["#1565c0", "#79c0ff"],
  type:        ["#6f42c1", "#d2a8ff"],
  attr:        ["#e36209", "#ffa657"],
  punctuation: ["#6e7781", "#8b949e"],
};

function getLang(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "ts", tsx: "ts", js: "ts", jsx: "ts", mjs: "ts", cjs: "ts",
    rs: "rust", py: "python", go: "go",
    json: "json", toml: "toml", yaml: "yaml", yml: "yaml",
    html: "html", css: "css", scss: "css",
    sh: "shell", bash: "shell", zsh: "shell", fish: "shell",
    md: "md", mdx: "md",
    sql: "sql",
    dockerfile: "shell",
  };
  if (!ext) return null;
  // Handle Dockerfile, Makefile etc.
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "shell";
  if (name === "makefile") return "shell";
  return map[ext] ?? null;
}

const KEYWORDS: Record<string, Set<string>> = {
  ts: new Set(["import","export","from","const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","new","this","class","extends","implements","interface","type","enum","async","await","try","catch","finally","throw","typeof","instanceof","in","of","default","yield","void","null","undefined","true","false","as","is","readonly","declare","abstract","static","private","public","protected","super","delete","debugger","satisfies"]),
  rust: new Set(["fn","let","mut","const","if","else","for","while","loop","match","return","use","mod","pub","crate","self","super","struct","enum","impl","trait","where","async","await","move","ref","type","as","in","unsafe","extern","dyn","true","false","Some","None","Ok","Err","Self"]),
  python: new Set(["def","class","if","elif","else","for","while","return","import","from","as","try","except","finally","raise","with","yield","lambda","pass","break","continue","and","or","not","in","is","None","True","False","self","async","await","nonlocal","global","assert","del"]),
  go: new Set(["func","var","const","if","else","for","range","return","package","import","type","struct","interface","map","chan","go","defer","select","case","switch","break","continue","default","fallthrough","nil","true","false","make","append","len","cap"]),
  json: new Set([]),
  toml: new Set(["true","false"]),
  yaml: new Set(["true","false","null","yes","no"]),
  html: new Set([]),
  css: new Set(["important"]),
  shell: new Set(["if","then","else","elif","fi","for","while","do","done","case","esac","in","function","return","export","local","readonly","set","unset","source","alias","echo","cd","exit","true","false"]),
  md: new Set([]),
  sql: new Set(["select","from","where","and","or","not","insert","into","values","update","set","delete","create","drop","alter","table","index","join","inner","left","right","outer","on","as","order","by","group","having","limit","offset","union","distinct","null","is","like","in","between","exists","case","when","then","else","end","count","sum","avg","min","max","true","false"]),
};

interface Token { text: string; type?: TokenType }

function tokenizeLine(line: string, lang: string | null): Token[] {
  if (!lang) return [{ text: line }];

  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Line comments
    if (
      (lang === "ts" || lang === "rust" || lang === "go" || lang === "css") &&
      line[i] === "/" && line[i + 1] === "/"
    ) {
      tokens.push({ text: line.slice(i), type: "comment" });
      return tokens;
    }
    if ((lang === "python" || lang === "shell" || lang === "toml" || lang === "yaml") && line[i] === "#") {
      tokens.push({ text: line.slice(i), type: "comment" });
      return tokens;
    }
    if (lang === "sql" && line[i] === "-" && line[i + 1] === "-") {
      tokens.push({ text: line.slice(i), type: "comment" });
      return tokens;
    }
    // HTML comments
    if (lang === "html" && line.slice(i, i + 4) === "<!--") {
      const end = line.indexOf("-->", i + 4);
      const slice = end >= 0 ? line.slice(i, end + 3) : line.slice(i);
      tokens.push({ text: slice, type: "comment" });
      i += slice.length;
      continue;
    }

    // Block comment start /* ... */ (inline only)
    if ((lang === "ts" || lang === "rust" || lang === "go" || lang === "css") && line[i] === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      const slice = end >= 0 ? line.slice(i, end + 2) : line.slice(i);
      tokens.push({ text: slice, type: "comment" });
      i += slice.length;
      continue;
    }

    // Strings
    if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, line.length);
      tokens.push({ text: line.slice(i, j), type: "string" });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(line[i]) && (i === 0 || /[\s,\(\[\{=:+\-*/<>!&|^~%]/.test(line[i - 1]))) {
      let j = i;
      if (line[j] === "0" && (line[j + 1] === "x" || line[j + 1] === "X" || line[j + 1] === "o" || line[j + 1] === "b")) j += 2;
      while (j < line.length && /[0-9a-fA-F._]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "number" });
      i = j;
      continue;
    }

    // Words (keywords, types)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const kws = KEYWORDS[lang];
      if (kws && (lang === "sql" ? kws.has(word.toLowerCase()) : kws.has(word))) {
        tokens.push({ text: word, type: "keyword" });
      } else if (/^[A-Z]/.test(word) && word.length > 1 && lang !== "json" && lang !== "yaml" && lang !== "md") {
        tokens.push({ text: word, type: "type" });
      } else {
        tokens.push({ text: word });
      }
      i = j;
      continue;
    }

    // Decorators / attributes
    if ((lang === "python" || lang === "ts") && line[i] === "@") {
      let j = i + 1;
      while (j < line.length && /[a-zA-Z0-9_.]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "attr" });
      i = j;
      continue;
    }
    // Rust attributes
    if (lang === "rust" && line[i] === "#" && line[i + 1] === "[") {
      const end = line.indexOf("]", i + 2);
      const slice = end >= 0 ? line.slice(i, end + 1) : line.slice(i);
      tokens.push({ text: slice, type: "attr" });
      i += slice.length;
      continue;
    }

    // Other characters
    tokens.push({ text: line[i] });
    i++;
  }

  return tokens;
}

function HighlightedLine({ line, lang }: { line: string; lang: string | null }) {
  const tokens = useMemo(() => tokenizeLine(line, lang), [line, lang]);

  if (!lang || tokens.length === 1) {
    return <>{line || " "}</>;
  }

  return (
    <>
      {tokens.map((t, i) =>
        t.type ? (
          <span
            key={i}
            className="syntax-token"
            style={{
              "--light": TOKEN_COLORS[t.type][0],
              "--dark": TOKEN_COLORS[t.type][1],
            } as React.CSSProperties}
          >
            {t.text}
          </span>
        ) : (
          <span key={i}>{t.text}</span>
        )
      )}
    </>
  );
}

function FileView({ filePath, project, onInsertRef }: { filePath: string; project: string; onInsertRef?: (ref: string) => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    setLoading(true);
    setAnchor(null);
    setSelEnd(null);

    fetch(`/api/file?path=${encodeURIComponent(filePath)}&project=${encodeURIComponent(project)}`)
      .then((r) => {
        if (!r.ok) {
          if (r.status === 413) throw new Error("File too large (>1MB)");
          if (r.status === 422) throw new Error("Binary file");
          if (r.status === 403) throw new Error("Access denied");
          if (r.status === 404) throw new Error("File not found");
          throw new Error(`Error ${r.status}`);
        }
        return r.text();
      })
      .then(setContent)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filePath, project]);

  const lines = content?.split("\n") ?? [];

  const handleLineClick = useCallback((lineNum: number) => {
    if (anchor === null) {
      setAnchor(lineNum);
      setSelEnd(null);
    } else {
      setSelEnd(lineNum);
    }
  }, [anchor]);

  const selRange = anchor !== null ? (
    selEnd !== null
      ? [Math.min(anchor, selEnd), Math.max(anchor, selEnd)] as const
      : [anchor, anchor] as const
  ) : null;

  const relPath = relativePath(filePath, project);
  const refText = selRange
    ? selRange[0] === selRange[1]
      ? `${relPath}:${selRange[0]}`
      : `${relPath}:${selRange[0]}-${selRange[1]}`
    : null;

  const handleInsert = useCallback(() => {
    if (refText && onInsertRef) {
      onInsertRef(refText);
    }
  }, [refText, onInsertRef]);

  const handleClear = useCallback(() => {
    setAnchor(null);
    setSelEnd(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-red-600">
        <AlertCircle size={14} />
        <span>{error}</span>
      </div>
    );
  }

  const lang = getLang(filePath);

  if (content == null) return null;

  return (
    <div className="relative h-full">
      <table className="w-full text-xs font-mono">
        <tbody>
          {lines.map((line, i) => {
            const lineNum = i + 1;
            const inRange = selRange && lineNum >= selRange[0] && lineNum <= selRange[1];
            const isAnchor = lineNum === anchor;
            return (
              <tr
                key={i}
                className={inRange ? "bg-blue-500/15" : "hover:bg-muted/50"}
                onClick={() => handleLineClick(lineNum)}
                style={{ cursor: "pointer" }}
              >
                <td className={`select-none text-right pr-3 pl-3 py-0.5 border-r border-border w-10 sticky left-0 ${inRange ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium" : "bg-background text-muted-foreground/60"}`}>
                  {lineNum}
                </td>
                <td className="pl-3 pr-3 py-0.5 text-foreground whitespace-pre">
                  <HighlightedLine line={line} lang={lang} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Selection action bar */}
      {selRange && (
        <div className="sticky bottom-3 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-1.5 bg-card border border-border rounded-lg shadow-lg px-3 py-1.5">
            <span className="text-xs font-mono text-foreground">{refText}</span>
            {onInsertRef && (
              <button
                onClick={handleInsert}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                title="Insert reference in chat"
              >
                <MessageSquarePlus size={12} />
                <span>Insert</span>
              </button>
            )}
            <button
              onClick={handleClear}
              className="p-0.5 hover:bg-muted rounded transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X size={12} className="text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FilePanel({ filePath, project, browse, onClose, onInsertRef }: FilePanelProps) {
  const [mode, setMode] = useState<Mode>(() =>
    browse ? { type: "browse", dirPath: project } : { type: "file", filePath }
  );

  // Reset mode when props change
  useEffect(() => {
    if (browse) {
      setMode({ type: "browse", dirPath: project });
    } else {
      setMode({ type: "file", filePath });
    }
  }, [filePath, project, browse]);

  const handleNavigate = (dir: string) => {
    setMode({ type: "browse", dirPath: dir });
  };

  const handleOpenFile = (path: string, returnDir: string) => {
    setMode({ type: "file", filePath: path, returnDir });
  };

  const handleBack = () => {
    if (mode.type === "file" && mode.returnDir) {
      setMode({ type: "browse", dirPath: mode.returnDir });
    }
  };

  const headerPath = mode.type === "browse" ? mode.dirPath : mode.filePath;

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />

      <div className="fixed inset-0 z-50 pt-[env(safe-area-inset-top)] lg:pt-0 lg:static lg:z-auto lg:w-[500px] lg:shrink-0 lg:border-l lg:border-border flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/50 shrink-0">
          {mode.type === "file" && mode.returnDir ? (
            <button onClick={handleBack} className="p-0.5 hover:bg-muted rounded transition-colors cursor-pointer shrink-0">
              <ArrowLeft size={14} className="text-muted-foreground" />
            </button>
          ) : mode.type === "browse" ? (
            <FolderOpen size={14} className="text-muted-foreground shrink-0" />
          ) : (
            <FileCode size={14} className="text-muted-foreground shrink-0" />
          )}
          <Breadcrumbs path={headerPath} project={project} onNavigate={handleNavigate} />
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors cursor-pointer shrink-0"
          >
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto min-h-0">
          {mode.type === "browse" ? (
            <BrowseView dirPath={mode.dirPath} project={project} onOpenFile={handleOpenFile} onNavigate={handleNavigate} />
          ) : (
            <FileView filePath={mode.filePath} project={project} onInsertRef={onInsertRef} />
          )}
        </div>
      </div>
    </>
  );
}
