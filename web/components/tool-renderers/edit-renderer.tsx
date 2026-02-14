import { createTwoFilesPatch } from "diff";
import { FileEdit, Plus, Minus, FilePlus2 } from "lucide-react";
import { CopyButton } from "./copy-button";

interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
}

interface WriteInput {
  file_path: string;
  content: string;
}

interface EditRendererProps {
  input: EditInput;
}

interface WriteRendererProps {
  input: WriteInput;
}

function getFileName(filePath: string) {
  const parts = filePath.split("/");
  return parts.slice(-2).join("/");
}

function parseDiff(diffText: string) {
  const lines = diffText.split("\n");
  const result: Array<{ type: "add" | "remove" | "context" | "header"; content: string }> = [];

  for (const line of lines) {
    if (line.startsWith("@@")) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({ type: "remove", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      result.push({ type: "context", content: line.slice(1) });
    }
  }

  return result;
}

export function EditRenderer(props: EditRendererProps) {
  const { input } = props;

  if (!input || !input.file_path) {
    return null;
  }

  const oldStr = input.old_string || "";
  const newStr = input.new_string || "";
  const fileName = getFileName(input.file_path);

  const diff = createTwoFilesPatch("a/" + fileName, "b/" + fileName, oldStr, newStr, "", "", {
    context: 3,
  });

  const parsedLines = parseDiff(diff);
  const addedLines = parsedLines.filter((l) => l.type === "add").length;
  const removedLines = parsedLines.filter((l) => l.type === "remove").length;

  return (
    <div className="w-full mt-2">
      <div className="rounded-md border bg-background overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/80 text-muted-foreground text-xs">
          <FileEdit size={14} />
          <span className="font-mono">{fileName}</span>
          <div className="flex items-center gap-2 ml-auto">
            {addedLines > 0 && (
              <span className="flex items-center gap-0.5 text-emerald-500">
                <Plus size={12} />
                {addedLines}
              </span>
            )}
            {removedLines > 0 && (
              <span className="flex items-center gap-0.5 text-destructive">
                <Minus size={12} />
                {removedLines}
              </span>
            )}
            <CopyButton text={input.file_path} />
          </div>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <pre className="text-xs font-mono p-0 m-0 bg-transparent rounded-none">
            {parsedLines.map((line, index) => {
              if (line.type === "header") {
                return (
                  <div
                    key={index}
                    className="px-3 py-1 bg-accent/50 text-muted-foreground border-y border-border"
                  >
                    {line.content}
                  </div>
                );
              }
              if (line.type === "add") {
                return (
                  <div
                    key={index}
                    className="px-3 py-0.5 bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                  >
                    <span className="select-none opacity-50 mr-2">+</span>
                    {line.content || " "}
                  </div>
                );
              }
              if (line.type === "remove") {
                return (
                  <div
                    key={index}
                    className="px-3 py-0.5 bg-destructive/10 text-destructive border-l-2 border-destructive"
                  >
                    <span className="select-none opacity-50 mr-2">-</span>
                    {line.content || " "}
                  </div>
                );
              }
              return (
                <div key={index} className="px-3 py-0.5 text-muted-foreground">
                  <span className="select-none opacity-30 mr-2"> </span>
                  {line.content || " "}
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function WriteRenderer(props: WriteRendererProps) {
  const { input } = props;

  if (!input || !input.file_path) {
    return null;
  }

  const content = input.content || "";
  const fileName = getFileName(input.file_path);
  const lineCount = content.split("\n").length;
  const preview = content.slice(0, 500);
  const isTruncated = content.length > 500;

  return (
    <div className="w-full mt-2">
      <div className="rounded-md border bg-background overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/80 text-muted-foreground text-xs">
          <FilePlus2 size={14} />
          <span className="font-mono">{fileName}</span>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs">{lineCount} lines</span>
            <CopyButton text={input.file_path} />
          </div>
        </div>
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <pre className="text-xs font-mono p-3 text-foreground bg-transparent rounded-none m-0">
            {preview}
            {isTruncated && (
              <span className="text-muted-foreground">... ({content.length - 500} more chars)</span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
