"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { TypeformFormData } from "../questions";

interface SuburbEntry {
  suburb: string;
  postcode: string;
}

interface SuburbAutocompleteProps {
  data: Partial<TypeformFormData>;
  updateData: (d: Partial<TypeformFormData>) => void;
  onAdvance: () => void;
}

export function SuburbAutocomplete({
  data,
  updateData,
  onAdvance,
}: SuburbAutocompleteProps) {
  const [suburbs, setSuburbs] = useState<SuburbEntry[]>([]);
  const [query, setQuery] = useState(
    data.suburb && data.postcode
      ? `${data.suburb}, ${data.postcode}`
      : data.suburb ?? ""
  );
  const [filtered, setFiltered] = useState<SuburbEntry[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSelected, setHasSelected] = useState(!!data.suburb);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/sydney-postcodes")
      .then((res) => res.json())
      .then((d: SuburbEntry[]) => setSuburbs(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    setHasSelected(false);
    if (val.trim().length >= 2) {
      const q = val.toLowerCase().trim();
      const matches = suburbs
        .filter(
          (s) =>
            s.suburb.toLowerCase().includes(q) || s.postcode.includes(q)
        )
        .slice(0, 10);
      setFiltered(matches);
      setShowDropdown(matches.length > 0);
    } else {
      setFiltered([]);
      setShowDropdown(false);
    }
  };

  const handleSelect = (entry: SuburbEntry) => {
    setQuery(`${entry.suburb}, ${entry.postcode}`);
    setShowDropdown(false);
    setHasSelected(true);
    updateData({
      suburb: entry.suburb,
      postcode: parseInt(entry.postcode, 10),
    });
  };

  return (
    <div className="flex flex-col gap-3" ref={dropdownRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (filtered.length > 0) setShowDropdown(true);
          }}
          placeholder="Start typing your suburb or postcode"
          className="w-full py-2.5 px-3 rounded-lg border border-slate-200 text-sm text-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
          autoFocus
        />
        {showDropdown && filtered.length > 0 && (
          <div className="absolute z-50 bottom-full mb-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
            {filtered.map((entry) => (
              <button
                key={`${entry.suburb}-${entry.postcode}`}
                type="button"
                onClick={() => handleSelect(entry)}
                className="w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
              >
                {entry.suburb}, {entry.postcode}
              </button>
            ))}
          </div>
        )}
      </div>
      {hasSelected && (
        <Button
          onClick={onAdvance}
          className="w-full h-11 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium text-sm"
        >
          Continue
        </Button>
      )}
    </div>
  );
}
