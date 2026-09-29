"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Mail, Pencil, User, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import {
  FormBanner,
  GhostButton,
  SelectField,
  SubmitButton,
  TextField,
  hasErrors,
  rules,
  validateAll,
} from "@/components/ui/form";
import { StudentAvatar } from "@/components/students/avatar";
import {
  submitJson,
  type Squad,
  type Student,
  type StudentFormValues,
} from "@/components/students/types";

type Field = keyof StudentFormValues;

/**
 * Edit a student's name, email and squad. Validates as you go (after a field
 * is first left), previews the changes, and maps a duplicate-email response
 * from the server back onto the email field.
 */
export function EditStudentDialog({
  student,
  squads,
  takenEmails,
  showUniversity,
  onClose,
  onSaved,
}: {
  student: Student | null;
  squads: Squad[];
  /** Lower-cased emails of every other student, for an early duplicate check. */
  takenEmails: Set<string>;
  showUniversity: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  // Keep the last student while the dialog animates out.
  const [shown, setShown] = useState(student);
  if (student && student !== shown) setShown(student);
  return (
    <Dialog
      open={Boolean(student)}
      onClose={onClose}
      title="Edit student"
      size="md"
      header={shown ? <EditHeader student={shown} /> : null}
    >
      {shown ? (
        <EditForm
          key={shown.id}
          student={shown}
          squads={squads}
          takenEmails={takenEmails}
          showUniversity={showUniversity}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function EditHeader({ student }: { student: Student }) {
  return (
    <div className="relative overflow-hidden border-b border-line px-6 pb-5 pt-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--brand) 22%, transparent), transparent 70%)",
        }}
      />
      <div className="relative flex items-center gap-3.5">
        <StudentAvatar id={student.id} name={student.name} email={student.email} size={48} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-text">
            <Pencil size={11} /> Edit student
          </p>
          <h2 className="truncate font-display text-[19px] font-bold tracking-[-0.02em]">
            {student.name ?? "Unnamed student"}
          </h2>
        </div>
      </div>
    </div>
  );
}

function EditForm({
  student,
  squads,
  takenEmails,
  showUniversity,
  onClose,
  onSaved,
}: {
  student: Student;
  squads: Squad[];
  takenEmails: Set<string>;
  showUniversity: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const initial: StudentFormValues = {
    name: student.name ?? "",
    email: student.email ?? "",
    squadId: student.squad_id ?? "",
  };
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState<Record<Field, boolean>>({
    name: false,
    email: false,
    squadId: false,
  });
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverEmailError, setServerEmailError] = useState<string | null>(
    null,
  );

  const schema = useMemo(
    () => ({
      name: [
        rules.required("Name"),
        rules.minLength(2, "Name"),
        rules.maxLength(80, "Name"),
      ],
      email: [
        rules.required("Email"),
        rules.email(),
        rules.notIn(takenEmails, "Another student already uses this email"),
      ],
      squadId: [rules.required("Squad")],
    }),
    [takenEmails],
  );
  const errors = validateAll(values, schema);
  const errorFor = (field: Field) =>
    touched[field]
      ? (errors[field] ?? (field === "email" ? serverEmailError : null))
      : null;

  const squadLabel = (id: string) => {
    const squad = squads.find((item) => item.id === id);
    return squad ? `Squad ${squad.squad_number}` : "No squad";
  };
  const changes = [
    values.name.trim() !== initial.name.trim() && {
      label: "Name",
      from: initial.name || "—",
      to: values.name.trim(),
    },
    values.email.trim().toLowerCase() !== initial.email.trim().toLowerCase() && {
      label: "Email",
      from: initial.email || "—",
      to: values.email.trim().toLowerCase(),
    },
    values.squadId !== initial.squadId && {
      label: "Squad",
      from: squadLabel(initial.squadId),
      to: squadLabel(values.squadId),
    },
  ].filter(Boolean) as { label: string; from: string; to: string }[];
  const squadChanged = values.squadId !== initial.squadId;

  function update(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (field === "email") setServerEmailError(null);
    setServerError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ name: true, email: true, squadId: true });
    if (hasErrors(errors) || !changes.length) return;
    setPending(true);
    setServerError("");
    try {
      await submitJson(`/api/students/${student.id}`, "PATCH", {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        squadId: values.squadId,
      });
      onSaved(values.name.trim());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update student.";
      if (/email/i.test(message)) setServerEmailError(message);
      else setServerError(message);
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="space-y-4 px-6 py-5">
        <TextField
          label="Full name"
          icon={<User size={15} />}
          value={values.name}
          maxChars={80}
          autoComplete="off"
          placeholder="e.g. Aditi Rao"
          onChange={(event) => update("name", event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          error={errorFor("name")}
          valid={touched.name && !errors.name}
        />
        <TextField
          label="Email"
          type="email"
          icon={<Mail size={15} />}
          value={values.email}
          autoComplete="off"
          placeholder="name@college.edu"
          onChange={(event) => update("email", event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={errorFor("email")}
          valid={touched.email && !errors.email && !serverEmailError}
          hint="Used to match this student's rows in weekly CSV imports."
        />
        <SelectField
          label="Squad"
          icon={<Users size={15} />}
          value={values.squadId}
          onChange={(event) => {
            update("squadId", event.target.value);
            setTouched((t) => ({ ...t, squadId: true }));
          }}
          error={errorFor("squadId")}
          hint={
            squadChanged
              ? "Moving squads closes the current membership today and starts a new one."
              : undefined
          }
        >
          <option value="">Select a squad</option>
          {squads.map((squad) => (
            <option key={squad.id} value={squad.id}>
              Squad {squad.squad_number}
              {showUniversity && squad.university_name
                ? ` · ${squad.university_name}`
                : ""}
            </option>
          ))}
        </SelectField>

        <AnimatePresence initial={false}>
          {changes.length ? (
            <motion.div
              key="changes"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 p-3">
                <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
                  {changes.length} pending{" "}
                  {changes.length === 1 ? "change" : "changes"}
                </p>
                <ul className="space-y-1.5">
                  <AnimatePresence initial={false}>
                    {changes.map((change) => (
                      <motion.li
                        key={change.label}
                        layout
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 6 }}
                        className="grid grid-cols-[52px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[12.5px]"
                      >
                        <span className="font-semibold text-ink-2">
                          {change.label}
                        </span>
                        <span className="truncate text-muted line-through decoration-faint">
                          {change.from}
                        </span>
                        <ArrowRight size={12} className="text-faint" />
                        <span className="truncate font-semibold text-ink">
                          {change.to}
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {serverError ? (
            <FormBanner key="error" tone="error">
              {serverError}
            </FormBanner>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line bg-surface-2 px-6 py-4">
        <span className="text-[12px] text-muted">
          {changes.length ? "Unsaved changes" : "No changes yet"}
        </span>
        <div className="flex gap-2.5">
          <GhostButton onClick={onClose} disabled={pending}>
            Cancel
          </GhostButton>
          <SubmitButton
            pending={pending}
            pendingLabel="Saving"
            disabled={!changes.length}
          >
            Save changes
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
