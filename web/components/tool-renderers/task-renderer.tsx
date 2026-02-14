import { Bot, Play, Pause, ArrowRight, RefreshCw } from "lucide-react";

interface TaskInput {
  description: string;
  prompt: string;
  subagent_type: string;
  model?: string;
  run_in_background?: boolean;
  resume?: string;
}

interface TaskRendererProps {
  input: TaskInput;
}

export function TaskRenderer(props: TaskRendererProps) {
  const { input } = props;

  if (!input) {
    return null;
  }

  return (
    <div className="w-full mt-2">
      <div className="rounded-md border bg-background overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/80 text-muted-foreground text-xs">
          <Bot size={14} />
          <span className="font-medium text-foreground">
            {input.subagent_type}
          </span>
          {input.description && (
            <>
              <ArrowRight size={10} />
              <span>{input.description}</span>
            </>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            {input.resume && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-secondary px-1.5 py-0.5 rounded">
                <RefreshCw size={10} />
                resume
              </span>
            )}
            {input.run_in_background && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-secondary px-1.5 py-0.5 rounded">
                <Pause size={10} />
                background
              </span>
            )}
            {input.model && (
              <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded">
                {input.model}
              </span>
            )}
          </div>
        </div>
        <div className="p-3">
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border bg-muted/30">
            <Play size={12} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs leading-relaxed whitespace-pre-wrap">
              {input.prompt}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
