"use client";

import { SingleSelect } from "./SingleSelect";
import { SelectOption } from "../questions";

interface BooleanSelectProps {
  options: SelectOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  columns?: number;
}

export function BooleanSelect({
  options,
  selected,
  onSelect,
  columns = 2,
}: BooleanSelectProps) {
  return (
    <SingleSelect
      options={options}
      selected={selected}
      onSelect={onSelect}
      columns={columns}
    />
  );
}
