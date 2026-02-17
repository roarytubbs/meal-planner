import { useEffect, useRef } from "react";
import { MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DayActionMenu({
  day,
  isEditing,
  isOpen,
  noteText,
  onClose,
  onOpenNoteEditor,
  onResetDay,
  onToggleEdit,
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
        className="h-9 w-9 border-border p-0"
        aria-label={`Open actions for ${day}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </Button>

      {isOpen ? (
        <div
          className="absolute right-0 top-11 z-20 w-48 rounded-md border border-border bg-card p-1.5 shadow-md"
          role="menu"
          aria-label={`${day} actions`}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-accent"
            onClick={() => {
              onToggleEdit();
              onClose();
            }}
          >
            {isEditing ? "Save" : "Edit"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-accent"
            onClick={() => {
              onResetDay();
              onClose();
            }}
          >
            Reset
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-accent"
            onClick={() => {
              onOpenNoteEditor();
              onClose();
            }}
          >
            {noteText ? "Edit note" : "Add note"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
