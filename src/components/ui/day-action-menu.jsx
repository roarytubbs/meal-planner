import { useEffect, useRef } from "react";
import { MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DAY_MODE_LABELS, DAY_MODES } from "@/lib/meal-planner";

export function DayActionMenu({
  activeDays,
  day,
  dayMode,
  isOpen,
  noteText,
  onClose,
  onCopyFrom,
  onDeleteNote,
  onOpenNoteEditor,
  onSetDayMode,
  onToggle,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!menuRef.current || menuRef.current.contains(event.target)) {
        return;
      }
      onClose();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        aria-label={`Open actions for ${day}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </Button>

      {isOpen ? (
        <div
          className="absolute right-0 top-11 z-20 w-64 space-y-3 rounded-lg border border-emerald-200 bg-white p-3 shadow-lg"
          role="menu"
          aria-label={`${day} actions`}
        >
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Day Mode</p>
            {DAY_MODES.map((mode) => (
              <button
                key={`${day}-${mode}`}
                type="button"
                className={
                  dayMode === mode
                    ? "w-full rounded-md border border-emerald-500 bg-emerald-50 px-2 py-1 text-left text-xs font-semibold text-emerald-700"
                    : "w-full rounded-md border border-border px-2 py-1 text-left text-xs hover:bg-muted"
                }
                onClick={() => {
                  onSetDayMode(mode);
                  onClose();
                }}
              >
                {DAY_MODE_LABELS[mode]}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Copy From</p>
            {activeDays.filter((candidate) => candidate !== day).map((sourceDay) => (
              <button
                key={`${day}-copy-${sourceDay}`}
                type="button"
                className="w-full rounded-md border border-border px-2 py-1 text-left text-xs hover:bg-muted"
                onClick={() => {
                  onCopyFrom(sourceDay);
                  onClose();
                }}
              >
                Copy from {sourceDay}
              </button>
            ))}
          </div>

          <div className="space-y-2 border-t border-emerald-100 pt-2">
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={onOpenNoteEditor}>
              {noteText ? "Edit Note" : "Add Note"}
            </Button>
            {noteText ? (
              <>
                <p className="line-clamp-2 text-xs text-muted-foreground">{noteText}</p>
                <Button type="button" size="sm" variant="destructive" className="w-full" onClick={onDeleteNote}>
                  Delete Note
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
