"use client";

import { Crown } from "lucide-react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import type { PointerEvent } from "react";
import { CountUp } from "@/components/reactbits/count-up";
import { StudentAvatar } from "@/components/students/avatar";
import type { RankedStudent } from "@/components/leaderboard/types";

// Metallic finishes for 1st / 2nd / 3rd.
const METALS = {
  1: {
    name: "Gold",
    light: "#fbe7a1",
    mid: "#d4a72c",
    dark: "#7a5a0c",
    height: 176,
  },
  2: {
    name: "Silver",
    light: "#f1f3f6",
    mid: "#aeb4bf",
    dark: "#5d636e",
    height: 128,
  },
  3: {
    name: "Bronze",
    light: "#f3c49b",
    mid: "#b8733f",
    dark: "#5f3517",
    height: 96,
  },
} as const;

type Place = 1 | 2 | 3;

/** Top three on stepped blocks: 2nd left, 1st centre (tallest), 3rd right. */
export function Podium({
  top,
  scoreLabel,
  currentStudentId,
  onOpen,
}: {
  top: RankedStudent[];
  scoreLabel: string;
  currentStudentId: string | null;
  onOpen: (student: RankedStudent) => void;
}) {
  const places: Array<[Place, RankedStudent | undefined]> = [
    [2, top[1]],
    [1, top[0]],
    [3, top[2]],
  ];
  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4">
      {places.map(([place, student]) => (
        <PodiumColumn
          key={place}
          place={place}
          student={student}
          scoreLabel={scoreLabel}
          isYou={Boolean(student && student.studentId === currentStudentId)}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function PodiumColumn({
  place,
  student,
  scoreLabel,
  isYou,
  onOpen,
}: {
  place: Place;
  student: RankedStudent | undefined;
  scoreLabel: string;
  isYou: boolean;
  onOpen: (student: RankedStudent) => void;
}) {
  const metal = METALS[place];
  const reduced = useReducedMotion();
  // Steps rise 3rd → 2nd → 1st, then the cards drop in on top.
  const riseDelay = place === 3 ? 0.1 : place === 2 ? 0.25 : 0.4;

  return (
    <div className="flex w-[31%] max-w-[220px] flex-col items-center">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: riseDelay + 0.35,
          type: "spring",
          stiffness: 180,
          damping: 18,
        }}
        className="relative z-10 mb-3 w-full"
      >
        {student ? (
          <WinnerCard
            place={place}
            student={student}
            scoreLabel={scoreLabel}
            isYou={isYou}
            onOpen={onOpen}
          />
        ) : (
          <p className="pb-6 text-center text-[13px] text-white/40">
            No one yet
          </p>
        )}
      </motion.div>

      {/* The step */}
      <motion.div
        initial={reduced ? false : { height: 0 }}
        animate={{ height: metal.height }}
        transition={{
          delay: riseDelay,
          type: "spring",
          stiffness: 120,
          damping: 16,
        }}
        className="relative w-full overflow-hidden rounded-t-2xl"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${metal.mid} 38%, #16161a) 0%, #121216 70%)`,
          boxShadow: `inset 0 1px 0 ${metal.light}, inset 0 0 0 1px color-mix(in srgb, ${metal.mid} 30%, transparent), 0 -18px 40px -24px ${metal.mid}`,
        }}
      >
        {/* Lit top edge */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-3"
          style={{
            background: `linear-gradient(90deg, ${metal.dark}, ${metal.light}, ${metal.dark})`,
            opacity: 0.85,
          }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-5 text-center font-display text-[56px] font-black leading-none tracking-[-0.06em] sm:text-[72px]"
          style={{
            backgroundImage: `linear-gradient(180deg, ${metal.light}, ${metal.mid} 55%, ${metal.dark})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {place}
        </span>
      </motion.div>
    </div>
  );
}

function WinnerCard({
  place,
  student,
  scoreLabel,
  isYou,
  onOpen,
}: {
  place: Place;
  student: RankedStudent;
  scoreLabel: string;
  isYou: boolean;
  onOpen: (student: RankedStudent) => void;
}) {
  const metal = METALS[place];
  const reduced = useReducedMotion();

  // Tilt toward the pointer (TiltedCard-style), springing back on leave.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [10, -10]), {
    stiffness: 220,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-12, 12]), {
    stiffness: 220,
    damping: 18,
  });

  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function onLeave() {
    px.set(0);
    py.set(0);
  }

  const body = (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX, rotateY, transformPerspective: 700 }}
      className="flex flex-col items-center text-center"
    >
      {place === 1 && (
        <Crown
          aria-hidden="true"
          className="dojo-anim mb-1 h-7 w-7 animate-[crown-float_3s_ease-in-out_infinite]"
          style={{ color: metal.mid }}
          fill={metal.mid}
          strokeWidth={1.5}
        />
      )}
      {/* Spinning metallic ring around the avatar */}
      <div
        className={`relative grid place-items-center rounded-full ${place === 1 ? "h-20 w-20 sm:h-24 sm:w-24" : "h-16 w-16 sm:h-20 sm:w-20"}`}
      >
        <div
          aria-hidden="true"
          className="dojo-anim absolute inset-0 animate-[spin_6s_linear_infinite] rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${metal.dark}, ${metal.light}, ${metal.mid}, ${metal.dark}, ${metal.light}, ${metal.dark})`,
            boxShadow: `0 0 28px -6px ${metal.mid}`,
          }}
        />
        <div className="absolute inset-[3px] grid place-items-center overflow-hidden rounded-full bg-[#141417]">
          <StudentAvatar
            id={student.studentId}
            name={student.name}
            size={place === 1 ? 90 : 74}
          />
        </div>
      </div>

      <p className="mt-3 line-clamp-1 max-w-full font-display text-[14px] font-semibold text-white sm:text-[15px]">
        {student.name}
        {isYou && (
          <span className="ml-1.5 rounded-md bg-white/15 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide">
            You
          </span>
        )}
      </p>
      <p className="line-clamp-1 text-[11.5px] text-white/50">
        {[student.squad && `Squad ${student.squad}`, student.university]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="mt-2 font-display text-[26px] font-extrabold leading-none tracking-[-0.03em] text-white sm:text-[30px]">
        <CountUp key={student.score} to={student.score} delay={0.8} />
        <span className="ml-1 text-[12px] font-semibold tracking-normal text-white/50">
          {scoreLabel}
        </span>
      </p>
      {student.change !== 0 && (
        <span
          className={`mt-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            student.change > 0
              ? "bg-[#0ca30c]/20 text-[#7ee07e]"
              : "bg-[#d03b3b]/20 text-[#ff9a96]"
          }`}
        >
          {student.change > 0 ? "▲" : "▼"} {Math.abs(student.change)} this week
        </span>
      )}
    </motion.div>
  );

  return (
    <button
      type="button"
      onClick={() => onOpen(student)}
      aria-label={`${metal.name}, ${student.name}, ${student.score} ${scoreLabel}. Open profile`}
      className="block w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      {body}
    </button>
  );
}
