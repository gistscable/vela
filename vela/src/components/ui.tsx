"use client";

import React from "react";

/* -------------------------------- Buttons ------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "red" | "navy" | "outline" | "link" | "gray" | "white";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({
  variant = "red",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const variants: Record<string, string> = {
    red: "bg-bank-red text-white border border-bank-red hover:bg-bank-redDark focus-visible:ring-bank-red",
    navy: "bg-bank-navy text-white border border-bank-navy hover:bg-bank-navyDark focus-visible:ring-bank-navy",
    outline:
      "border border-gray-400 bg-white text-bank-navy hover:bg-gray-50 focus-visible:ring-gray-400",
    gray: "border border-gray-300 bg-gray-100 text-gray-800 hover:bg-gray-200",
    white: "border border-white bg-white text-bank-navy hover:bg-gray-100",
    link: "text-bank-link underline underline-offset-2 hover:text-bank-blueDark",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-[12px]",
    md: "h-10 px-5 text-[13px]",
    lg: "h-11 px-7 text-[14px]",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}

/* -------------------------------- Inputs -------------------------------- */

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  /** Control rendered inside the right edge of the field (e.g. a show/hide button). */
  trailing?: React.ReactNode;
};

export function Input({ label, error, hint, icon, trailing, className = "", id, ...rest }: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-[12px] font-bold text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={`h-10 w-full rounded border bg-white px-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
            icon ? "pl-9" : ""
          } ${
            error
              ? "border-bank-red focus:border-bank-red focus:ring-red-100"
              : "border-gray-400 focus:border-bank-blue focus:ring-blue-100"
          } ${className}`}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {hint && !error && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-semibold text-bank-red">{error}</p>}
    </div>
  );
}

/**
 * Password field with an accessible Show/Hide toggle. The password stays hidden by default and the
 * toggle only flips the input's `type`, so the typed value is never cleared or re-created. It is a
 * `type="button"` so activating it (click, Enter or Space) never submits the surrounding form.
 */
export function PasswordInput({
  toggleLabel,
  ...props
}: Omit<InputProps, "type" | "trailing"> & {
  /** Distinguishes toggles when a form has several password fields, e.g. "new password". Default "password". */
  toggleLabel?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  const inputId = props.id ?? (props.label ? props.label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const noun = toggleLabel ?? "password";
  return (
    <Input
      {...props}
      id={inputId}
      type={visible ? "text" : "password"}
      className={`pr-16 ${props.className ?? ""}`}
      // Stop browsers/keyboards from capitalising or "correcting" a revealed password.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={`${visible ? "Hide" : "Show"} ${noun}`}
          aria-controls={inputId}
          data-testid={`password-toggle-${inputId ?? "field"}`}
          className="h-8 rounded px-2 text-[12px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bank-blue focus-visible:ring-offset-1"
        >
          {visible ? "Hide" : "Show"}
        </button>
      }
    />
  );
}

export function Select({
  label,
  children,
  className = "",
  id,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1 block text-[12px] font-bold text-gray-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`h-10 w-full rounded border border-gray-400 bg-white px-2.5 text-[14px] text-gray-900 focus:border-bank-blue focus:outline-none focus:ring-2 focus:ring-blue-100 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

export function Textarea({
  label,
  className = "",
  id,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const taId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={taId} className="mb-1 block text-[12px] font-bold text-gray-700">
          {label}
        </label>
      )}
      <textarea
        id={taId}
        className={`min-h-[80px] w-full rounded border border-gray-400 bg-white px-3 py-2 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-bank-blue focus:outline-none focus:ring-2 focus:ring-blue-100 ${className}`}
        {...rest}
      />
    </div>
  );
}

/* --------------------------------- Misc --------------------------------- */

export function Panel({
  title,
  action,
  className = "",
  children,
  bodyClassName = "p-5",
}: {
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className={`border border-gray-300 bg-white shadow-panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3">
          <h2 className="text-[15px] font-bold text-bank-navy">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`border border-gray-300 bg-white shadow-panel ${className}`}>{children}</div>;
}

export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "green" | "amber" | "red" | "navy";
}) {
  const tones: Record<string, string> = {
    gray: "bg-gray-200 text-gray-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-bank-red",
    navy: "bg-bank-sand text-bank-navy",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Avatar({
  firstName,
  lastName,
  size = 34,
  dark = false,
}: {
  firstName: string;
  lastName: string;
  size?: number;
  dark?: boolean;
}) {
  const label = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded font-bold ${
        dark ? "bg-white/15 text-white" : "bg-bank-navy text-white"
      }`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {label}
    </span>
  );
}

export function Alert({
  tone = "error",
  title,
  children,
}: {
  tone?: "error" | "success" | "info" | "warn";
  title?: string;
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    error: "border-bank-red bg-red-50 text-bank-red",
    success: "border-emerald-600 bg-emerald-50 text-emerald-800",
    info: "border-bank-blue bg-blue-50 text-bank-navy",
    warn: "border-amber-500 bg-amber-50 text-amber-900",
  };
  return (
    <div className={`flex items-start gap-2.5 border-l-4 border-y border-r px-4 py-2.5 text-[13px] ${tones[tone]}`}>
      <div>
        {title && <p className="mb-0.5 font-bold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, color = "#002855" }: { value: number; max: number; color?: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-2.5 w-full border border-gray-300 bg-gray-100">
      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

/* -------------------------------- Charts -------------------------------- */

export function AreaChart({
  points,
  height = 190,
}: {
  points: { label: string; balance: number }[];
  height?: number;
}) {
  const w = 720;
  const h = height;
  const pad = { top: 16, right: 26, bottom: 28, left: 26 };
  const values = points.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => pad.left + (i * (w - pad.left - pad.right)) / Math.max(points.length - 1, 1);
  const y = (v: number) => pad.top + (1 - (v - min) / range) * (h - pad.top - pad.bottom);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${h - pad.bottom} L ${x(0).toFixed(1)} ${h - pad.bottom} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: "auto" }} role="img" aria-label="Balance over time">
      <defs>
        <linearGradient id="fmbAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0057B8" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0057B8" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const gy = pad.top + t * (h - pad.top - pad.bottom);
        return <line key={t} x1={pad.left} x2={w - pad.right} y1={gy} y2={gy} stroke="#D9DDE1" strokeDasharray="2 4" />;
      })}
      <path d={area} fill="url(#fmbAreaFill)" />
      <path d={line} fill="none" stroke="#002855" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={x(i)}
            cy={y(p.balance)}
            r={i === points.length - 1 ? 4.5 : 0}
            fill="#D8232A"
            stroke="white"
            strokeWidth="1.5"
          />
          {i % 2 === 0 && (
            <text x={x(i)} y={h - 8} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 11 }}>
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function DonutChart({
  data,
  size = 150,
}: {
  data: { category: string; label: string; total: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.total, 0) || 1;
  const r = 56;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label="Spending by category">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#E8EDF2" strokeWidth="20" />
      {data.map((d) => {
        const frac = d.total / total;
        const dash = `${(frac * c).toFixed(2)} ${c.toFixed(2)}`;
        const offset = -acc * c;
        acc += frac;
        return (
          <circle
            key={d.category}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth="20"
            strokeDasharray={dash}
            strokeDashoffset={offset}
            transform="rotate(-90 70 70)"
          />
        );
      })}
    </svg>
  );
}

export function EmptyState({ title, body, icon }: { title: string; body: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded border border-gray-300 bg-white text-gray-400">
        {icon ?? <span className="text-lg">◎</span>}
      </div>
      <h3 className="text-[14px] font-bold text-bank-navy">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-gray-500">{body}</p>
    </div>
  );
}
