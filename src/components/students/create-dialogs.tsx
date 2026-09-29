"use client";

import { AnimatePresence } from "motion/react";
import { Hash, Mail, School, User, UserPlus, Users } from "lucide-react";
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
  type University,
} from "@/components/students/types";

type Common = {
  open: boolean;
  onClose: () => void;
  squads: Squad[];
  /** Super admins pick a university; campus managers use their own. */
  universities: University[] | null;
  defaultUniversityId: string;
  onCreated: (message: string) => void;
};

function UniversityField({
  universities,
  value,
  onChange,
  error,
}: {
  universities: University[];
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}) {
  return (
    <SelectField
      label="University"
      icon={<School size={15} />}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
    >
      <option value="">Select a university</option>
      {universities.map((university) => (
        <option key={university.id} value={university.id}>
          {university.name}
        </option>
      ))}
    </SelectField>
  );
}

/* ─── Squad ──────────────────────────────────────────────────────────────── */

export function CreateSquadDialog(props: Common) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Create a squad"
      eyebrow="New squad"
      description="Squads group students for weekly belt tracking."
      icon={<Users size={18} />}
    >
      <SquadForm {...props} />
    </Dialog>
  );
}

function SquadForm({
  onClose,
  squads,
  universities,
  defaultUniversityId,
  onCreated,
}: Common) {
  const [values, setValues] = useState({
    squadNumber: "",
    universityId: defaultUniversityId,
  });
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState("");

  const taken = useMemo(
    () =>
      new Set(
        squads
          .filter(
            (squad) =>
              !universities || squad.university_id === values.universityId,
          )
          .map((squad) => squad.squad_number.toLowerCase()),
      ),
    [squads, universities, values.universityId],
  );
  const errors = validateAll(values, {
    squadNumber: [
      rules.required("Squad number"),
      rules.maxLength(12, "Squad number"),
      rules.pattern(
        /^[A-Za-z0-9-]+$/,
        "Use letters, numbers or dashes only",
      ),
      rules.notIn(taken, "This squad already exists"),
    ],
    universityId: universities ? [rules.required("University")] : [],
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) return;
    setPending(true);
    setServerError("");
    try {
      const squadNumber = values.squadNumber.trim();
      await submitJson("/api/squads", "POST", {
        squadNumber,
        ...(universities ? { universityId: values.universityId } : {}),
      });
      onCreated(`Squad ${squadNumber} created`);
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "Unable to create squad.",
      );
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="space-y-4 px-6 pb-5">
        {universities ? (
          <UniversityField
            universities={universities}
            value={values.universityId}
            onChange={(universityId) =>
              setValues((current) => ({ ...current, universityId }))
            }
            error={touched ? errors.universityId : null}
          />
        ) : null}
        <TextField
          label="Squad number"
          icon={<Hash size={15} />}
          value={values.squadNumber}
          maxChars={12}
          placeholder="e.g. 12"
          autoComplete="off"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              squadNumber: event.target.value,
            }));
            setServerError("");
          }}
          onBlur={() => setTouched(true)}
          error={touched ? errors.squadNumber : null}
          valid={touched && !errors.squadNumber}
          hint={
            taken.size
              ? `${taken.size} squad${taken.size === 1 ? "" : "s"} already exist here`
              : "This will be the first squad"
          }
        />
        <AnimatePresence>
          {serverError ? (
            <FormBanner key="error" tone="error">
              {serverError}
            </FormBanner>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="flex justify-end gap-2.5 border-t border-line bg-surface-2 px-6 py-4">
        <GhostButton onClick={onClose} disabled={pending}>
          Cancel
        </GhostButton>
        <SubmitButton pending={pending} pendingLabel="Creating">
          Create squad
        </SubmitButton>
      </div>
    </form>
  );
}

/* ─── Student ────────────────────────────────────────────────────────────── */

export function CreateStudentDialog(
  props: Common & { takenEmails: Set<string>; defaultSquadId?: string },
) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Add a student"
      eyebrow="New student"
      description="They start in the chosen squad from today."
      icon={<UserPlus size={18} />}
    >
      <StudentForm {...props} />
    </Dialog>
  );
}

type StudentFields = "name" | "email" | "squadId" | "universityId";

function StudentForm({
  onClose,
  squads,
  universities,
  defaultUniversityId,
  defaultSquadId,
  takenEmails,
  onCreated,
}: Common & { takenEmails: Set<string>; defaultSquadId?: string }) {
  const [values, setValues] = useState<Record<StudentFields, string>>({
    name: "",
    email: "",
    squadId: defaultSquadId ?? "",
    universityId: defaultUniversityId,
  });
  const [touched, setTouched] = useState<Record<StudentFields, boolean>>({
    name: false,
    email: false,
    squadId: false,
    universityId: false,
  });
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverEmailError, setServerEmailError] = useState<string | null>(
    null,
  );

  const squadOptions = universities
    ? squads.filter((squad) => squad.university_id === values.universityId)
    : squads;
  const errors = validateAll(values, {
    name: [
      rules.required("Name"),
      rules.minLength(2, "Name"),
      rules.maxLength(80, "Name"),
    ],
    email: [
      rules.required("Email"),
      rules.email(),
      rules.notIn(takenEmails, "A student with this email already exists"),
    ],
    squadId: [
      rules.required("Squad"),
      (value) =>
        value && !squadOptions.some((squad) => squad.id === value)
          ? "Pick a squad from this university"
          : null,
    ],
    universityId: universities ? [rules.required("University")] : [],
  });
  const errorFor = (field: StudentFields) =>
    touched[field]
      ? (errors[field] ?? (field === "email" ? serverEmailError : null))
      : null;

  function update(field: StudentFields, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (field === "email") setServerEmailError(null);
    setServerError("");
  }
  const blur = (field: StudentFields) => () =>
    setTouched((current) => ({ ...current, [field]: true }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ name: true, email: true, squadId: true, universityId: true });
    if (hasErrors(errors)) return;
    setPending(true);
    setServerError("");
    try {
      await submitJson("/api/students", "POST", {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        squadId: values.squadId,
        ...(universities ? { universityId: values.universityId } : {}),
      });
      onCreated(`${values.name.trim()} added`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create student.";
      if (/email/i.test(message)) setServerEmailError(message);
      else setServerError(message);
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="space-y-4 px-6 pb-5">
        {/* Live preview of the new student */}
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-2 p-3">
          <StudentAvatar
            id={values.email || "new-student"}
            name={values.name || null}
            size={40}
          />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">
              {values.name.trim() || "New student"}
            </p>
            <p className="truncate text-[12px] text-muted">
              {values.email.trim().toLowerCase() || "email pending"}
              {values.squadId
                ? ` · Squad ${squads.find((squad) => squad.id === values.squadId)?.squad_number ?? ""}`
                : ""}
            </p>
          </div>
        </div>

        {universities ? (
          <UniversityField
            universities={universities}
            value={values.universityId}
            onChange={(value) => {
              update("universityId", value);
              update("squadId", "");
            }}
            error={errorFor("universityId")}
          />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Full name"
            icon={<User size={15} />}
            value={values.name}
            maxChars={80}
            placeholder="e.g. Aditi Rao"
            autoComplete="off"
            onChange={(event) => update("name", event.target.value)}
            onBlur={blur("name")}
            error={errorFor("name")}
            valid={touched.name && !errors.name}
          />
          <TextField
            label="Email"
            type="email"
            icon={<Mail size={15} />}
            value={values.email}
            placeholder="name@college.edu"
            autoComplete="off"
            onChange={(event) => update("email", event.target.value)}
            onBlur={blur("email")}
            error={errorFor("email")}
            valid={touched.email && !errors.email && !serverEmailError}
          />
        </div>
        <SelectField
          label="Squad"
          icon={<Users size={15} />}
          value={values.squadId}
          onChange={(event) => {
            update("squadId", event.target.value);
            blur("squadId")();
          }}
          onBlur={blur("squadId")}
          error={errorFor("squadId")}
          disabled={!squadOptions.length}
          hint={
            squadOptions.length
              ? undefined
              : universities && !values.universityId
                ? "Pick a university first"
                : universities
                  ? "This university has no squads yet — create one first"
                  : "Create a squad first"
          }
        >
          <option value="">Select a squad</option>
          {squadOptions.map((squad) => (
            <option key={squad.id} value={squad.id}>
              Squad {squad.squad_number}
            </option>
          ))}
        </SelectField>
        <AnimatePresence>
          {serverError ? (
            <FormBanner key="error" tone="error">
              {serverError}
            </FormBanner>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="flex justify-end gap-2.5 border-t border-line bg-surface-2 px-6 py-4">
        <GhostButton onClick={onClose} disabled={pending}>
          Cancel
        </GhostButton>
        <SubmitButton pending={pending} pendingLabel="Adding">
          <UserPlus size={15} /> Add student
        </SubmitButton>
      </div>
    </form>
  );
}
