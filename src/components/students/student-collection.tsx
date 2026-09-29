"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CalendarDays,
  ChevronDown,
  History,
  Mail,
  Pencil,
  School,
} from "lucide-react";
import { useState } from "react";
import { SpotlightCard } from "@/components/reactbits/spotlight-card";
import { StudentAvatar } from "@/components/students/avatar";
import { BeltBadge } from "@/components/belts/belts";
import { LANGUAGES, type Language } from "@/lib/dashboard/metrics";
import {
  beltTotal,
  formatDate,
  type Student,
  type WeekStudent,
} from "@/components/students/types";

const PAGE = 36;

export type CollectionView = "cards" | "list";

export type StudentBelts = {
  rank: number;
  total: number;
  levels: Record<Language, number>;
};

type Shared = {
  monitor: boolean;
  weekById: Map<string, WeekStudent>;
  showUniversity: boolean;
  canEdit: boolean;
  onEdit: (student: Student) => void;
  onHistory: (student: Student) => void;
  onSquad: (squadId: string) => void;
  belts: Map<string, StudentBelts>;
};

/** Card grid or list of students, paged with "Show more". */
export function StudentCollection({
  students,
  view,
  ...shared
}: Shared & { students: Student[]; view: CollectionView }) {
  const [limit, setLimit] = useState(PAGE);
  const visible = students.slice(0, limit);
  const reduced = useReducedMotion();

  return (
    <div>
      {view === "cards" ? (
        <motion.div
          layout={!reduced}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          <AnimatePresence>
            {visible.map((student, index) => (
              <StudentCard
                key={student.id}
                student={student}
                index={index}
                {...shared}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
          <div
            className={`hidden gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted md:grid ${listColumns(shared)}`}
          >
            <span>Student</span>
            <span>Squad</span>
            {shared.showUniversity ? <span>University</span> : null}
            {shared.monitor ? <span>This week</span> : null}
            <span>Member since</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-line">
            <AnimatePresence>
              {visible.map((student, index) => (
                <StudentRow
                  key={student.id}
                  student={student}
                  index={index}
                  {...shared}
                />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}

      {students.length > limit ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((current) => current + PAGE)}
            className="group inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2 shadow-[var(--card-shadow)] transition hover:border-ink/40 hover:text-ink"
          >
            Show {Math.min(PAGE, students.length - limit)} more
            <span className="text-muted">
              · {students.length - limit} left
            </span>
            <ChevronDown
              size={15}
              className="transition group-hover:translate-y-0.5"
            />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function listColumns({
  showUniversity,
  monitor,
}: Pick<Shared, "showUniversity" | "monitor">) {
  // Student · Squad · [University] · [This week] · Since · Actions
  if (showUniversity && monitor)
    return "md:grid-cols-[minmax(0,2.2fr)_0.8fr_1.2fr_0.8fr_1fr_172px]";
  if (showUniversity)
    return "md:grid-cols-[minmax(0,2.2fr)_0.8fr_1.3fr_1fr_172px]";
  if (monitor) return "md:grid-cols-[minmax(0,2.4fr)_0.9fr_0.9fr_1fr_172px]";
  return "md:grid-cols-[minmax(0,2.6fr)_1fr_1fr_172px]";
}

function WeekBadge({ week }: { week: WeekStudent | undefined }) {
  if (!week?.has_weekly_data)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5 text-[11.5px] font-semibold text-warning-text">
        <span className="h-1.5 w-1.5 rounded-full bg-current" /> No data
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11.5px] font-semibold text-success-text">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {beltTotal(week.final_belt_levels)} belts
    </span>
  );
}

function SquadChip({
  student,
  onSquad,
}: {
  student: Student;
  onSquad: (squadId: string) => void;
}) {
  if (!student.squad_number || !student.squad_id)
    return <span className="text-[12.5px] text-faint">No squad</span>;
  const squadId = student.squad_id;
  return (
    <button
      type="button"
      onClick={() => onSquad(squadId)}
      title={`Show only Squad ${student.squad_number}`}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[12px] font-semibold text-ink-2 transition hover:border-ink/30 hover:text-ink"
    >
      <span className="text-faint">#</span>
      {student.squad_number}
    </button>
  );
}

function MembershipState({ student }: { student: Student }) {
  if (student.end_date)
    return (
      <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-semibold text-muted">
        Left {formatDate(student.end_date)}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-text">
      <span className="relative flex h-1.5 w-1.5">
        <span className="dojo-anim absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      Active
    </span>
  );
}

function IconAction({
  label,
  onClick,
  children,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition active:scale-[0.97] ${
        primary
          ? "bg-ink text-page hover:opacity-90"
          : "border border-line-strong text-ink-2 hover:border-ink/40 hover:text-ink"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

function StudentCard({
  student,
  index,
  monitor,
  weekById,
  showUniversity,
  canEdit,
  onEdit,
  onHistory,
  onSquad,
  belts,
}: Shared & { student: Student; index: number }) {
  const reduced = useReducedMotion();
  const week = weekById.get(student.id);
  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{
        delay: reduced ? 0 : Math.min(index % 36, 12) * 0.025,
        type: "spring",
        stiffness: 320,
        damping: 30,
      }}
    >
      <SpotlightCard className="group h-full transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--pop-shadow)]">
        <div className="flex h-full flex-col p-4">
          <div className="flex items-start gap-3">
            <StudentAvatar id={student.id} name={student.name} email={student.email} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">
                {student.name ?? "Unnamed student"}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted">
                <Mail size={12} className="shrink-0" />
                <span className="truncate">{student.email ?? "No email"}</span>
              </p>
            </div>
            <MembershipState student={student} />
          </div>

          <div className="mb-4 mt-4 flex flex-wrap items-center gap-2">
            <SquadChip student={student} onSquad={onSquad} />
            {showUniversity && student.university_name ? (
              <span className="inline-flex min-w-0 items-center gap-1 truncate text-[12px] text-muted">
                <School size={12} className="shrink-0" />
                <span className="truncate">{student.university_name}</span>
              </span>
            ) : null}
            {monitor ? <WeekBadge week={week} /> : null}
          </div>

          {belts.get(student.id) ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {LANGUAGES.map((language) => (
                <BeltBadge
                  key={language}
                  language={language}
                  level={belts.get(student.id)!.levels[language] ?? 0}
                />
              ))}
            </div>
          ) : null}
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-dashed border-line pt-3">
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
              <CalendarDays size={12.5} />
              Since {formatDate(student.start_date)}
            </span>
            <div className="flex gap-1.5">
              {canEdit ? (
                <IconAction label="Edit" onClick={() => onEdit(student)}>
                  <Pencil size={13} />
                </IconAction>
              ) : null}
              <IconAction
                label="History"
                primary
                onClick={() => onHistory(student)}
              >
                <History size={13} />
              </IconAction>
            </div>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

function StudentRow({
  student,
  index,
  monitor,
  weekById,
  showUniversity,
  canEdit,
  onEdit,
  onHistory,
  onSquad,
}: Shared & { student: Student; index: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ delay: reduced ? 0 : Math.min(index % 36, 12) * 0.018 }}
      className={`group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-surface-2 ${listColumns({ showUniversity, monitor })}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <StudentAvatar id={student.id} name={student.name} email={student.email} size={36} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-ink">
            {student.name ?? "Unnamed student"}
          </p>
          <p className="truncate text-[12.5px] text-muted">
            {student.email ?? "No email"}
          </p>
        </div>
      </div>
      <div className="order-last col-span-2 flex flex-wrap items-center gap-2 md:order-none md:col-span-1">
        <SquadChip student={student} onSquad={onSquad} />
        <span className="md:hidden">
          <MembershipState student={student} />
        </span>
      </div>
      {showUniversity ? (
        <span className="hidden truncate text-[13px] text-ink-2 md:block">
          {student.university_name ?? "—"}
        </span>
      ) : null}
      {monitor ? (
        <span className="hidden md:block">
          <WeekBadge week={weekById.get(student.id)} />
        </span>
      ) : null}
      <span className="hidden text-[13px] text-muted md:block">
        {formatDate(student.start_date)}
        {student.end_date ? (
          <span className="block text-[11.5px] text-faint">
            to {formatDate(student.end_date)}
          </span>
        ) : null}
      </span>
      <div className="flex justify-end gap-1.5">
        {canEdit ? (
          <IconAction label="Edit" onClick={() => onEdit(student)}>
            <Pencil size={13} />
          </IconAction>
        ) : null}
        <IconAction
          label="History"
          primary
          onClick={() => onHistory(student)}
        >
          <History size={13} />
        </IconAction>
      </div>
    </motion.li>
  );
}
