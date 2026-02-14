import { Check } from "lucide-react";
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalContent,
  TerminalCopyButton,
  TerminalActions,
} from "../ai-elements/terminal";
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockFilename,
  CodeBlockActions,
  CodeBlockCopyButton,
} from "../ai-elements/code-block";
import type { BundledLanguage } from "shiki";

interface BashInput {
  command: string;
  description?: string;
  timeout?: number;
}

interface BashRendererProps {
  input: BashInput;
}

interface BashResultRendererProps {
  content: string;
  isError?: boolean;
}

export function BashRenderer(props: BashRendererProps) {
  const { input } = props;

  if (!input || !input.command) {
    return null;
  }

  return (
    <div className="w-full mt-2">
      <CodeBlock
        code={input.command}
        language={"bash" as BundledLanguage}
      >
        <CodeBlockHeader>
          <CodeBlockTitle>
            <CodeBlockFilename>
              {input.description || "Command"}
            </CodeBlockFilename>
          </CodeBlockTitle>
          <CodeBlockActions>
            <CodeBlockCopyButton />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    </div>
  );
}

export function BashResultRenderer(props: BashResultRendererProps) {
  const { content, isError } = props;

  if (!content || content.trim().length === 0) {
    return (
      <div className="w-full mt-2">
        <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-muted/30">
          <Check size={14} className="text-emerald-500" />
          <span className="text-xs text-muted-foreground">Command completed successfully (no output)</span>
        </div>
      </div>
    );
  }

  const lines = content.split("\n");
  const maxLines = 30;
  const truncated = lines.length > maxLines;
  const displayContent = truncated ? lines.slice(0, maxLines).join("\n") : content;
  const truncationNote = truncated ? `\n... ${lines.length - maxLines} more lines` : "";

  return (
    <div className="w-full mt-2">
      <Terminal output={displayContent + truncationNote}>
        <TerminalHeader>
          <TerminalTitle>
            {isError ? "Error Output" : "Output"}
          </TerminalTitle>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{lines.length} lines</span>
            <TerminalActions>
              <TerminalCopyButton />
            </TerminalActions>
          </div>
        </TerminalHeader>
        <TerminalContent className="max-h-80" />
      </Terminal>
    </div>
  );
}
