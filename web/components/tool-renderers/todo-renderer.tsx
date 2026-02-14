import { Circle, CircleCheck, Loader2 } from "lucide-react";
import {
  Task,
  TaskTrigger,
  TaskContent,
  TaskItem,
} from "../ai-elements/task";

interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

interface TodoRendererProps {
  todos: TodoItem[];
}

function getStatusIcon(status: string) {
  if (status === "completed") {
    return <CircleCheck size={14} className="text-primary" />;
  }
  if (status === "in_progress") {
    return <Loader2 size={14} className="text-muted-foreground animate-spin" />;
  }
  return <Circle size={14} className="text-muted-foreground/50" />;
}

export function TodoRenderer(props: TodoRendererProps) {
  const { todos } = props;

  if (!todos || todos.length === 0) {
    return null;
  }

  const completedCount = todos.filter((t) => t.status === "completed").length;
  const totalCount = todos.length;

  return (
    <div className="w-full mt-2">
      <Task defaultOpen>
        <TaskTrigger title={`Tasks (${completedCount}/${totalCount})`} />
        <TaskContent>
          {todos.map((todo, index) => (
            <TaskItem key={index} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex-shrink-0">{getStatusIcon(todo.status)}</span>
              <span className={todo.status === "completed" ? "line-through opacity-50" : ""}>
                {todo.content}
              </span>
            </TaskItem>
          ))}
        </TaskContent>
      </Task>
    </div>
  );
}
