import { useState } from "react";
import { FileCode2, ChevronDown, ChevronRight } from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";

export interface PlanItem {
  id: string;
  content: string;
  source: "exit" | "implement";
}

interface PlanWidgetProps {
  plans: PlanItem[];
}

export function PlanWidget({ plans }: PlanWidgetProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);

  if (plans.length === 0) return null;

  const latest = plans[plans.length - 1];
  const previous = plans.slice(0, -1);

  return (
    <div className="bg-zinc-900/95 backdrop-blur border border-indigo-500/30 rounded-lg overflow-hidden shadow-xl">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-3 py-2 border-b border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors cursor-pointer"
      >
        <FileCode2 size={14} className="text-indigo-400" />
        <span className="text-xs font-medium text-zinc-300">Plan</span>
        {plans.length > 1 && (
          <span className="text-[10px] text-zinc-500 ml-auto">{plans.length} plans</span>
        )}
        <span className="text-zinc-500 ml-auto">
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {!collapsed && (
        <div className="max-h-64 overflow-y-auto">
          {previous.length > 0 && (
            <button
              onClick={() => setShowPrevious(!showPrevious)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800/30 transition-colors cursor-pointer border-b border-zinc-800/50"
            >
              {showPrevious ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Previous plans ({previous.length})</span>
            </button>
          )}
          {showPrevious && previous.map((plan) => (
            <div key={plan.id} className="px-3 py-2 border-b border-zinc-800/50">
              <MarkdownRenderer content={plan.content} />
            </div>
          ))}
          <div className="px-3 py-2">
            <MarkdownRenderer content={latest.content} />
          </div>
        </div>
      )}
    </div>
  );
}
