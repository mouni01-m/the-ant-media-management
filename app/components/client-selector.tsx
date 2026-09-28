"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type ClientOption = {
  id: string;
  name?: string;
  company?: string;
  contactPerson?: string;
};

export default function ClientSelector({
  clients,
  value,
  onChange,
  placeholder = "Select client",
  allowClear = true,
  clearLabel = "Internal / No client",
}: {
  clients: ClientOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const selected = clients.find((client) => client.id === value);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((client) =>
      [client.name, client.company, client.contactPerson]
        .some((part) => String(part || "").toLowerCase().includes(needle)),
    );
  }, [clients, search]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const estimatedHeight = Math.min(360, 112 + filtered.length * 58);
      const top = rect.bottom + estimatedHeight < window.innerHeight
        ? rect.bottom + 6
        : Math.max(12, rect.top - estimatedHeight - 6);
      setPosition({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const closeOutside = (event: MouseEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !(event.target as Element)?.closest("[data-client-selector-popover]")
      ) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", closeOutside);
    };
  }, [open, filtered.length]);

  const popover = open && typeof document !== "undefined"
    ? createPortal(
        <div
          data-client-selector-popover
          style={{ position: "fixed", top: position.top, left: position.left, width: position.width, zIndex: 10000 }}
          className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-white shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search size={16} className="shrink-0 text-gray-500" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, brand, or contact"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
          </div>
          <div className="max-h-[min(18rem,55vh)] overflow-y-auto p-1">
            {allowClear && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); setSearch(""); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-gray-600 hover:bg-red-50">
                {clearLabel}
              </button>
            )}
            {filtered.map((client) => {
              const title = client.company || client.name || "Unnamed client";
              return (
                <button key={client.id} type="button" onClick={() => { onChange(client.id); setOpen(false); setSearch(""); }} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-red-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{title}</span>
                    <span className="block truncate text-xs text-gray-500">{[client.company && client.name && client.company !== client.name ? client.name : "", client.contactPerson].filter(Boolean).join(" · ") || "Client"}</span>
                  </span>
                  {value === client.id && <Check size={16} className="shrink-0 text-[var(--brand-red)]" />}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="p-4 text-center text-sm text-gray-500">No clients match that search.</p>}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className="min-w-0">
      <button ref={triggerRef} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-[var(--brand-border)] bg-white px-4 text-left text-sm outline-none focus:border-[var(--brand-red-secondary)]/50">
        <span className={selected ? "truncate text-[var(--brand-black)]" : "truncate text-gray-500"}>{selected ? selected.company || selected.name || "Unnamed client" : placeholder}</span>
        <span className="flex shrink-0 items-center gap-2">{value && allowClear && <span role="button" tabIndex={0} aria-label="Clear selected client" onClick={(event) => { event.stopPropagation(); onChange(""); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.stopPropagation(); onChange(""); } }} className="rounded p-1 hover:bg-gray-100"><X size={14} /></span>}<ChevronDown size={16} className="text-gray-500" /></span>
      </button>
      {popover}
    </div>
  );
}
