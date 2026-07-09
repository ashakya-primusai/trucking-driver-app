"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { searchPlaces, type PlaceSuggestion } from "@/lib/place-search";

type Props = {
  onSelect: (place: PlaceSuggestion) => void;
  placeholder?: string;
};

function formatSuggestionLabel(label: string): string {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 3) return label;
  return `${parts.slice(0, 3).join(", ")}…`;
}

export default function PlaceSearchInput({
  onSelect,
  placeholder = "Search for a city or address…",
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const runSearch = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const results = await searchPlaces(trimmed);
      if (requestId !== requestIdRef.current) return;
      setSuggestions(results);
      setOpen(results.length > 0);
      if (results.length === 0) {
        setError("No places found. Try a different search.");
      }
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setSuggestions([]);
      setOpen(false);
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleSelect(place: PlaceSuggestion) {
    setQuery(formatSuggestionLabel(place.label));
    setSuggestions([]);
    setOpen(false);
    setError(null);
    onSelect(place);
  }

  const showList = open && suggestions.length > 0;

  return (
    <div ref={rootRef} className="relative z-[1000]">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 pr-10 text-[14px] text-[color:var(--ink)] outline-none transition focus:border-[color:var(--accent)]"
          autoComplete="off"
        />
        {loading ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--ink-muted)]">
            …
          </span>
        ) : null}
      </div>

      {showList ? (
        <ul
          className="mt-2 max-h-52 w-full overflow-y-auto rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] py-1 shadow-lg"
          role="listbox"
        >
          {suggestions.map((place) => (
            <li key={place.id} role="option">
              <button
                type="button"
                onClick={() => handleSelect(place)}
                className="w-full px-4 py-3 text-left transition hover:bg-[color:var(--canvas-muted)] active:bg-[color:var(--accent-soft)]"
              >
                <span className="block text-[14px] font-medium leading-snug text-[color:var(--ink)]">
                  {formatSuggestionLabel(place.label)}
                </span>
                <span className="mt-0.5 block text-[11px] text-[color:var(--ink-muted)]">
                  {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error && !showList ? (
        <p className="mt-2 text-[12px] text-[color:var(--ink-muted)]">{error}</p>
      ) : null}
    </div>
  );
}
