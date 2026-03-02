import { useCallback } from "react";
import { Share2 } from "lucide-react";

interface ShareButtonProps {
  text: string;
}

export function ShareButton({ text }: ShareButtonProps) {
  const handleClick = useCallback(() => {
    navigator.share({ text }).catch(() => {});
  }, [text]);

  if (typeof navigator === "undefined" || !navigator.share) return null;

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center justify-center w-8 h-8 sm:w-6 sm:h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      title="Share"
    >
      <Share2 className="sm:w-3.5 sm:h-3.5 w-5 h-5" />
    </button>
  );
}
