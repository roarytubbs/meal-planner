import { useEffect } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function MobileSheet({ children, open, onClose, title }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <button
        type="button"
        aria-label="Close shopping list"
        className="absolute inset-0 bg-zinc-950/45"
        onClick={onClose}
      />
      <section className="absolute inset-x-0 bottom-0 max-h-[82vh] rounded-t-2xl border border-emerald-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-emerald-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-emerald-950">{title}</h3>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close sheet">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>
        <div className="max-h-[calc(82vh-56px)] overflow-y-auto p-4">{children}</div>
      </section>
    </div>
  );
}
