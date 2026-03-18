"use client";

import { Button } from "@/components/ui/button";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onAdvance: () => void;
  placeholder?: string;
  label?: string;
}

export function TextInput({
  value,
  onChange,
  onAdvance,
  placeholder,
  label,
}: TextInputProps) {
  return (
    <div className="flex flex-col gap-3">
      {label && (
        <p className="text-sm font-medium text-slate-600">{label}</p>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full py-2.5 px-3 rounded-lg border border-slate-200 text-sm text-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
        autoFocus
      />
      {value.trim() && (
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
