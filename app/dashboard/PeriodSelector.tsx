"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function PeriodSelector({
  options,
  current,
  paramName = "ym",
}: {
  options: { value: string; label: string }[];
  current: string;
  paramName?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sp = new URLSearchParams(params.toString());
    sp.set(paramName, e.target.value);
    router.push(`?${sp.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      className="apple-input"
      style={{ fontSize: "13px", padding: "7px 32px 7px 14px", cursor: "pointer", minWidth: "140px" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
