import { HelpCircle, CheckSquare, Square } from "lucide-react";

interface QuestionOption {
  label: string;
  description: string;
}

interface Question {
  header: string;
  question: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface AskQuestionInput {
  questions: Question[];
}

interface AskQuestionRendererProps {
  input: AskQuestionInput;
}

export function AskQuestionRenderer(props: AskQuestionRendererProps) {
  const { input } = props;

  if (!input || !input.questions || input.questions.length === 0) {
    return null;
  }

  return (
    <div className="w-full mt-2 space-y-3">
      {input.questions.map((question, qIndex) => (
        <div
          key={qIndex}
          className="rounded-md border bg-background overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/80 text-muted-foreground text-xs">
            <HelpCircle size={14} />
            <span className="font-medium text-foreground">
              {question.header || "Question"}
            </span>
            {question.multiSelect && (
              <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded ml-auto">
                Multi-select
              </span>
            )}
          </div>
          <div className="p-3 space-y-3">
            <p className="text-sm">{question.question}</p>
            {question.options && question.options.length > 0 && (
              <div className="space-y-2">
                {question.options.map((option, oIndex) => {
                  const Icon = question.multiSelect ? CheckSquare : Square;
                  return (
                    <div
                      key={oIndex}
                      className="flex items-start gap-2 px-2 py-1.5 rounded border bg-muted/30"
                    >
                      <Icon
                        size={14}
                        className="text-muted-foreground mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium">
                          {option.label}
                        </div>
                        {option.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {option.description}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
