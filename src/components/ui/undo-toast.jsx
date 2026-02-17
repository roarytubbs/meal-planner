import { Button } from "@/components/ui/button";

export function UndoToast({ toast, onDismiss, onUndo }) {
  if (!toast) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-md border border-emerald-200 bg-white/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-emerald-950">{toast.message}</p>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button type="button" size="sm" onClick={onUndo}>
            Undo
          </Button>
        </div>
      </div>
    </div>
  );
}
