"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, CircleAlert } from "lucide-react";
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

/* ─── Validation ─────────────────────────────────────────────────────────── */

export type Rule = (value: string) => string | null;

export const rules = {
  required:
    (label: string): Rule =>
    (value) =>
      value.trim() ? null : `${label} is required`,
  minLength:
    (min: number, label: string): Rule =>
    (value) =>
      value.trim().length >= min
        ? null
        : `${label} needs at least ${min} characters`,
  maxLength:
    (max: number, label: string): Rule =>
    (value) =>
      value.trim().length <= max
        ? null
        : `${label} must be ${max} characters or fewer`,
  email: (): Rule => (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
      ? null
      : "Enter a valid email like name@college.edu",
  pattern:
    (regex: RegExp, message: string): Rule =>
    (value) =>
      regex.test(value.trim()) ? null : message,
  notIn:
    (taken: Set<string>, message: string): Rule =>
    (value) =>
      taken.has(value.trim().toLowerCase()) ? message : null,
};

/** First failing rule's message, or null when the value passes. */
export function validate(value: string, fieldRules: Rule[]) {
  for (const rule of fieldRules) {
    const message = rule(value);
    if (message) return message;
  }
  return null;
}

/** Validate a record of values against a record of rules. */
export function validateAll<K extends string>(
  values: Record<K, string>,
  schema: Record<K, Rule[]>,
) {
  const errors = {} as Record<K, string | null>;
  for (const key of Object.keys(schema) as K[]) {
    errors[key] = validate(values[key], schema[key]);
  }
  return errors;
}

export function hasErrors(errors: Record<string, string | null>) {
  return Object.values(errors).some(Boolean);
}

/* ─── Field shell ────────────────────────────────────────────────────────── */

type FieldShellProps = {
  label: string;
  hint?: string;
  error?: string | null;
  valid?: boolean;
  counter?: { value: number; max: number };
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
};

/** Label, control slot, and an animated hint / error line underneath. */
export function Field({
  label,
  hint,
  error,
  valid,
  counter,
  className = "",
  children,
}: FieldShellProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const showMessage = Boolean(error || hint);
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[12.5px] font-semibold tracking-[-0.005em] text-ink-2"
        >
          {label}
        </label>
        {counter ? (
          <span
            className={`font-mono text-[10.5px] tabular-nums ${counter.value > counter.max ? "text-brand-text" : "text-faint"}`}
          >
            {counter.value}/{counter.max}
          </span>
        ) : valid ? (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-success-text"
          >
            <Check size={13} strokeWidth={3} />
          </motion.span>
        ) : null}
      </div>
      {children({ id, describedBy: showMessage ? messageId : undefined })}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="error"
            id={messageId}
            role="alert"
            initial={{ opacity: 0, height: 0, x: -4 }}
            animate={{ opacity: 1, height: "auto", x: [0, -3, 3, -2, 0] }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-1.5 overflow-hidden text-[12px] font-medium text-brand-text"
          >
            <CircleAlert size={12.5} className="shrink-0" />
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p
            key="hint"
            id={messageId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden text-[12px] text-muted"
          >
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function controlClass(invalid: boolean, hasIcon: boolean) {
  return [
    "w-full rounded-xl border bg-surface py-2.5 pr-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] duration-200",
    "placeholder:text-faint disabled:cursor-not-allowed disabled:opacity-60",
    hasIcon ? "pl-10" : "pl-3.5",
    invalid
      ? "border-brand-text/70 bg-brand-soft/40 focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_18%,transparent)]"
      : "border-line-strong hover:border-[color-mix(in_srgb,var(--ink)_28%,var(--line-strong))] focus:border-ink focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--ink)_8%,transparent)]",
  ].join(" ");
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  hint?: string;
  error?: string | null;
  valid?: boolean;
  icon?: ReactNode;
  maxChars?: number;
  fieldClassName?: string;
  inputRef?: React.Ref<HTMLInputElement>;
};

export function TextField({
  label,
  hint,
  error,
  valid,
  icon,
  maxChars,
  fieldClassName,
  inputRef,
  value,
  ...rest
}: TextFieldProps) {
  const length = typeof value === "string" ? value.length : 0;
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      valid={valid}
      className={fieldClassName}
      counter={
        maxChars && length > maxChars * 0.7
          ? { value: length, max: maxChars }
          : undefined
      }
    >
      {({ id, describedBy }) => (
        <div className="relative">
          {icon ? (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">
              {icon}
            </span>
          ) : null}
          <input
            ref={inputRef}
            id={id}
            value={value}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={controlClass(Boolean(error), Boolean(icon))}
            {...rest}
          />
        </div>
      )}
    </Field>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  hint?: string;
  error?: string | null;
  valid?: boolean;
  icon?: ReactNode;
  fieldClassName?: string;
};

export function SelectField({
  label,
  hint,
  error,
  valid,
  icon,
  fieldClassName,
  children,
  ...rest
}: SelectFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      valid={valid}
      className={fieldClassName}
    >
      {({ id, describedBy }) => (
        <div className="relative">
          {icon ? (
            <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-faint">
              {icon}
            </span>
          ) : null}
          <select
            id={id}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={`${controlClass(Boolean(error), Boolean(icon))} appearance-none pr-9`}
            {...rest}
          >
            {children}
          </select>
          <ChevronDown
            size={15}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>
      )}
    </Field>
  );
}

/* ─── Buttons & banners ──────────────────────────────────────────────────── */

export function SubmitButton({
  pending,
  pendingLabel,
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      className={`relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-page shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_16px_-6px_rgba(0,0,0,0.35)] transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingLabel ?? "Saving"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-ink-2 transition hover:border-ink/40 hover:text-ink active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Animated success / error banner for form-level results. */
export function FormBanner({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  return (
    <motion.div
      role={tone === "error" ? "alert" : "status"}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6 }}
      className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium ${
        tone === "error"
          ? "border-brand-line bg-brand-soft text-brand-text"
          : "border-success-line bg-success-soft text-success-text"
      }`}
    >
      {tone === "error" ? (
        <CircleAlert size={15} className="mt-px shrink-0" />
      ) : (
        <Check size={15} className="mt-px shrink-0" strokeWidth={2.6} />
      )}
      <span>{children}</span>
    </motion.div>
  );
}
