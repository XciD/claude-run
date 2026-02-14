import { CopyButton } from "./copy-button";
import type { BundledLanguage } from "shiki";
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockFilename,
  CodeBlockActions,
  CodeBlockCopyButton,
} from "../ai-elements/code-block";

interface ReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

interface ReadRendererProps {
  input: ReadInput;
}

interface FileContentRendererProps {
  content: string;
  fileName?: string;
}

function getFileName(filePath: string) {
  const parts = filePath.split("/");
  return parts.slice(-2).join("/");
}

function getFileExtension(filePath: string) {
  const parts = filePath.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() : "";
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  cpp: "cpp",
  c: "c",
  css: "css",
  scss: "scss",
  html: "html",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  toml: "toml",
  xml: "xml",
  svelte: "svelte",
  vue: "vue",
  swift: "swift",
  kt: "kotlin",
  dart: "dart",
  lua: "lua",
  r: "r",
  zig: "zig",
};

const DISPLAY_NAMES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript React",
  js: "JavaScript",
  jsx: "JavaScript React",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  cpp: "C++",
  c: "C",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  md: "Markdown",
  sql: "SQL",
  sh: "Shell",
  bash: "Bash",
};

export function ReadRenderer(props: ReadRendererProps) {
  const { input } = props;

  if (!input || !input.file_path) {
    return null;
  }

  const fileName = getFileName(input.file_path);
  const ext = getFileExtension(input.file_path);
  const language = ext ? DISPLAY_NAMES[ext] : null;

  return (
    <div className="w-full mt-2">
      <div className="flex items-center gap-2 rounded-md border bg-muted/80 px-3 py-2 text-muted-foreground text-xs">
        <span className="font-mono">{fileName}</span>
        {language && (
          <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">
            {language}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {(input.offset || input.limit) && (
            <span className="text-xs mr-1">
              {input.offset && `from line ${input.offset}`}
              {input.offset && input.limit && ", "}
              {input.limit && `${input.limit} lines`}
            </span>
          )}
          <CopyButton text={input.file_path} />
        </div>
      </div>
    </div>
  );
}

export function FileContentRenderer(props: FileContentRendererProps) {
  const { content, fileName } = props;

  if (!content) {
    return null;
  }

  const lines = content.split("\n");
  const maxLines = 50;
  const truncated = lines.length > maxLines;
  const displayContent = truncated ? lines.slice(0, maxLines).join("\n") : content;

  const ext = fileName ? getFileExtension(fileName) : "";
  const shikiLang = ext ? EXT_TO_LANGUAGE[ext] : undefined;

  return (
    <div className="w-full mt-2">
      <CodeBlock
        code={displayContent}
        language={(shikiLang || "text") as BundledLanguage}
        showLineNumbers
      >
        <CodeBlockHeader>
          <CodeBlockTitle>
            <CodeBlockFilename>File Content</CodeBlockFilename>
            {shikiLang && (
              <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                {ext ? DISPLAY_NAMES[ext] || shikiLang : ""}
              </span>
            )}
          </CodeBlockTitle>
          <CodeBlockActions>
            <span className="text-xs text-muted-foreground">{lines.length} lines</span>
            <CodeBlockCopyButton />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
      {truncated && (
        <div className="px-3 py-2 text-xs text-muted-foreground border border-t-0 rounded-b-md bg-muted/50">
          ... {lines.length - maxLines} more lines
        </div>
      )}
    </div>
  );
}
