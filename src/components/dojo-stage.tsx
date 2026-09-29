"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

export type BotMood = "idle" | "focus" | "loading" | "error";

const BRAND = "#ef3837";

// Pivot points inside the SVG viewBox (0 0 320 380)
const NECK = { x: 160, y: 198 };
const HIP = { x: 160, y: 304 };
const BAND_KNOT = { x: 246, y: 86 };
const BELT_KNOT = { x: 160, y: 283 };
const EYE_CENTER_Y = 136;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ─── Stage ────────────────────────────────────────────────────────────────────
export function DojoStage({ mood }: { mood: BotMood }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const visorRef = useRef<SVGRectElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const blinkRef = useRef<SVGGElement>(null);
  const glareRef = useRef<SVGGElement>(null);
  const bandTailsRef = useRef<SVGGElement>(null);
  const beltTailsRef = useRef<SVGGElement>(null);
  const leftArmRef = useRef<SVGGElement>(null);
  const rightArmRef = useRef<SVGGElement>(null);
  const moodRef = useRef(mood);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  // One rAF loop drives every cursor-reactive part without re-rendering React.
  useEffect(() => {
    const pointer = { x: 0, y: 0, active: false, lastMove: 0 };
    const look = { x: 0, y: 0 };
    let tailAngle = 0;
    let nextBlink = performance.now() + 2500;
    let blinkUntil = 0;
    let frame = 0;

    function onPointerMove(event: PointerEvent) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      pointer.lastMove = performance.now();
    }

    function onPointerOut(event: PointerEvent) {
      if (!event.relatedTarget) pointer.active = false;
    }

    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      const visor = visorRef.current?.getBoundingClientRect();
      const stage = stageRef.current?.getBoundingClientRect();
      if (!visor || !stage) return;

      const tracking = pointer.active && now - pointer.lastMove < 6000;
      const cx = visor.left + visor.width / 2;
      const cy = visor.top + visor.height / 2;
      const dx = tracking ? pointer.x - cx : Math.sin(now / 1700) * 260;
      const dy = tracking ? pointer.y - cy : Math.sin(now / 2600) * 70 - 20;

      const prevX = look.x;
      look.x += (clamp(dx / 420, -1, 1) - look.x) * 0.09;
      look.y += (clamp(dy / 320, -1, 1) - look.y) * 0.09;
      const velocity = look.x - prevX;

      headRef.current?.setAttribute(
        "transform",
        `translate(${look.x * 7} ${look.y * 5}) rotate(${look.x * 8} ${NECK.x} ${NECK.y})`,
      );
      bodyRef.current?.setAttribute(
        "transform",
        `rotate(${look.x * 2.5} ${HIP.x} ${HIP.y})`,
      );
      eyesRef.current?.setAttribute(
        "transform",
        `translate(${look.x * 17} ${look.y * 10})`,
      );
      // Glass reflection drifts against the eyes for a sense of depth.
      glareRef.current?.setAttribute(
        "transform",
        `translate(${look.x * -6} ${look.y * -3})`,
      );

      // Cloth and arms lag behind the head like they have weight.
      const tailTarget = clamp(-velocity * 900, -28, 28) + Math.sin(now / 420) * 4;
      tailAngle += (tailTarget - tailAngle) * 0.08;
      bandTailsRef.current?.setAttribute(
        "transform",
        `rotate(${tailAngle} ${BAND_KNOT.x} ${BAND_KNOT.y})`,
      );
      beltTailsRef.current?.setAttribute(
        "transform",
        `rotate(${tailAngle * 0.5 - look.x * 6} ${BELT_KNOT.x} ${BELT_KNOT.y})`,
      );
      const sway = Math.sin(now / 900) * 2;
      leftArmRef.current?.setAttribute(
        "transform",
        `rotate(${sway + tailAngle * 0.25} 96 226)`,
      );
      rightArmRef.current?.setAttribute(
        "transform",
        `rotate(${-sway + tailAngle * 0.25} 224 226)`,
      );

      // Occasional blink, only while idle.
      if (now > nextBlink) {
        blinkUntil = now + 130;
        nextBlink = now + 2200 + Math.random() * 4200;
      }
      const blinking = now < blinkUntil && moodRef.current === "idle";
      blinkRef.current?.setAttribute(
        "transform",
        blinking ? `translate(0 ${EYE_CENTER_Y * 0.9}) scale(1 0.1)` : "",
      );

      const px = tracking ? pointer.x - stage.left : stage.width * (0.5 + look.x * 0.3);
      const py = tracking ? pointer.y - stage.top : stage.height * (0.45 + look.y * 0.2);
      stageRef.current?.style.setProperty("--mx", `${px}px`);
      stageRef.current?.style.setProperty("--my", `${py}px`);
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerout", onPointerOut);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerout", onPointerOut);
    };
  }, []);

  const eyeCore = mood === "error" ? "#ffd2cf" : "#ffffff";
  const eyeEdge = mood === "error" ? BRAND : "#dfe7ff";

  return (
    <div
      ref={stageRef}
      className="relative flex h-full min-h-[340px] flex-col overflow-hidden bg-[#0b0b0d] text-white lg:min-h-[560px]"
      style={{ ["--mx" as string]: "50%", ["--my" as string]: "45%" }}
    >
      {/* Dot grid, brightened under the cursor */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.32) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(220px circle at var(--mx) var(--my), black, transparent)",
          WebkitMaskImage:
            "radial-gradient(220px circle at var(--mx) var(--my), black, transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[44%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(239,56,55,0.14) 0%, transparent 60%)",
        }}
      />

      {/* Logo */}
      <div className="relative z-10 px-6 pt-6 sm:px-10 sm:pt-9 lg:px-14 lg:pt-12">
        <Image
          src="/imgs/kalvium_extended_logo.png"
          alt="Kalvium"
          width={2560}
          height={543}
          preload
          className="h-7 w-auto lg:h-8"
        />
      </div>

      {/* Robot */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-4">
        <div
          key={mood === "error" ? "shake" : "still"}
          className={mood === "error" ? "dojo-anim animate-[dojo-shake_0.5s_ease-in-out]" : ""}
        >
          <svg
            viewBox="0 0 320 380"
            className="h-[min(30vh,230px)] w-auto select-none lg:h-[min(44vh,430px)]"
            role="img"
            aria-label="Dojo bot, a small robot that watches your cursor"
          >
            <defs>
              {/* Painted metal shell: lit from the top left */}
              <linearGradient id="bot-shell" x1="0.15" y1="0" x2="0.85" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="40%" stopColor="#e9eaee" />
                <stop offset="80%" stopColor="#babcc5" />
                <stop offset="100%" stopColor="#8f929c" />
              </linearGradient>
              <radialGradient id="bot-shell-hot" cx="30%" cy="18%" r="45%">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="bot-rim" x1="0" y1="0" x2="1" y2="0">
                <stop offset="70%" stopColor={BRAND} stopOpacity="0" />
                <stop offset="100%" stopColor={BRAND} stopOpacity="0.45" />
              </linearGradient>
              <linearGradient id="bot-metal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4a4c55" />
                <stop offset="55%" stopColor="#23242a" />
                <stop offset="100%" stopColor="#101114" />
              </linearGradient>
              <linearGradient id="bot-metal-h" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#15161a" />
                <stop offset="45%" stopColor="#50525c" />
                <stop offset="100%" stopColor="#15161a" />
              </linearGradient>
              <linearGradient id="bot-bezel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a3a6b0" />
                <stop offset="100%" stopColor="#f2f3f6" />
              </linearGradient>
              <linearGradient id="bot-visor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={mood === "error" ? "#230c0c" : "#1a1b22"} />
                <stop offset="100%" stopColor="#040405" />
              </linearGradient>
              <linearGradient id="bot-cloth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff5a55" />
                <stop offset="45%" stopColor={BRAND} />
                <stop offset="100%" stopColor="#a8201f" />
              </linearGradient>
              <linearGradient id="bot-cloth-dark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#d52e2d" />
                <stop offset="100%" stopColor="#7d1515" />
              </linearGradient>
              <radialGradient id="bot-eye" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor={eyeCore} />
                <stop offset="100%" stopColor={eyeEdge} />
              </radialGradient>
              <radialGradient id="bot-thrust" cx="50%" cy="0%" r="100%">
                <stop offset="0%" stopColor="#fff1e6" stopOpacity="0.95" />
                <stop offset="25%" stopColor="#ff7a5c" stopOpacity="0.8" />
                <stop offset="100%" stopColor={BRAND} stopOpacity="0" />
              </radialGradient>
              <pattern id="bot-scan" width="4" height="3" patternUnits="userSpaceOnUse">
                <rect width="4" height="1" fill="#fff" opacity="0.05" />
              </pattern>
              <filter id="bot-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="bot-blur-sm" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
              <filter id="bot-blur-lg" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" />
              </filter>
              <clipPath id="bot-head-clip">
                <rect x="70" y="58" width="180" height="140" rx="46" />
              </clipPath>
              <clipPath id="bot-body-clip">
                <path d="M112 212 H208 Q222 212 222 228 L216 292 Q214 312 194 312 H126 Q106 312 104 292 L98 228 Q98 212 112 212 Z" />
              </clipPath>
              <clipPath id="bot-visor-clip">
                <rect x="92" y="100" width="136" height="76" rx="26" />
              </clipPath>
            </defs>

            {/* Floor shadow */}
            <ellipse
              cx="160"
              cy="360"
              rx="74"
              ry="10"
              fill="#000"
              filter="url(#bot-blur-lg)"
              className="dojo-anim"
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: "dojo-shadow 4s ease-in-out infinite",
              }}
            />
            <ellipse
              cx="160"
              cy="360"
              rx="40"
              ry="5"
              fill={BRAND}
              opacity="0.25"
              filter="url(#bot-blur-sm)"
            />

            <g className="dojo-anim" style={{ animation: "dojo-bob 4s ease-in-out infinite" }}>
              {/* Thruster */}
              <g
                className="dojo-anim"
                style={{
                  animation: `dojo-flicker ${mood === "loading" ? "0.22s" : "1.2s"} ease-in-out infinite`,
                }}
              >
                <ellipse cx="160" cy="330" rx="34" ry="26" fill="url(#bot-thrust)" filter="url(#bot-blur-sm)" />
                <ellipse cx="160" cy="320" rx="10" ry="5" fill="#fff4ec" opacity="0.9" filter="url(#bot-blur-sm)" />
              </g>
              <rect x="140" y="306" width="40" height="12" rx="5" fill="url(#bot-metal-h)" />

              {/* Body */}
              <g ref={bodyRef}>
                {/* Arms */}
                <g ref={leftArmRef}>
                  <circle cx="96" cy="226" r="11" fill="url(#bot-metal)" />
                  <rect x="84" y="228" width="18" height="34" rx="9" fill="url(#bot-shell)" />
                  <rect x="86" y="258" width="14" height="6" rx="2" fill="#2a2b31" />
                  <rect x="83" y="262" width="20" height="22" rx="10" fill="url(#bot-shell)" />
                </g>
                <g ref={rightArmRef}>
                  <circle cx="224" cy="226" r="11" fill="url(#bot-metal)" />
                  <rect x="218" y="228" width="18" height="34" rx="9" fill="url(#bot-shell)" />
                  <rect x="220" y="258" width="14" height="6" rx="2" fill="#2a2b31" />
                  <rect x="217" y="262" width="20" height="22" rx="10" fill="url(#bot-shell)" />
                </g>

                {/* Torso */}
                <path
                  d="M112 212 H208 Q222 212 222 228 L216 292 Q214 312 194 312 H126 Q106 312 104 292 L98 228 Q98 212 112 212 Z"
                  fill="url(#bot-shell)"
                />
                <g clipPath="url(#bot-body-clip)">
                  <ellipse cx="160" cy="210" rx="44" ry="10" fill="#000" opacity="0.28" filter="url(#bot-blur-sm)" />
                  <ellipse cx="128" cy="226" rx="34" ry="16" fill="url(#bot-shell-hot)" />
                  <rect x="98" y="212" width="124" height="100" fill="url(#bot-rim)" />
                  <line x1="160" y1="256" x2="160" y2="266" stroke="#9fa2ab" strokeWidth="1" />
                </g>
                <path
                  d="M112 212.5 H208 Q221.5 212.5 221.5 228"
                  fill="none"
                  stroke="#fff"
                  strokeOpacity="0.8"
                  strokeWidth="1"
                />

                {/* Chest display */}
                <rect x="128" y="226" width="64" height="28" rx="8" fill="#9a9da6" />
                <rect x="129.5" y="227.5" width="61" height="25" rx="7" fill="url(#bot-visor)" />
                <rect x="129.5" y="227.5" width="61" height="25" rx="7" fill="url(#bot-scan)" />
                {[0, 1, 2, 3].map((index) => (
                  <rect
                    key={index}
                    x={137 + index * 12}
                    y="236"
                    width="7"
                    height="7"
                    rx="1.5"
                    fill={BRAND}
                    filter="url(#bot-glow)"
                    className="dojo-anim"
                    style={{
                      animation: `dojo-led ${mood === "loading" ? "0.8s" : "2.4s"} ease-in-out ${index * (mood === "loading" ? 0.2 : 0.6)}s infinite`,
                    }}
                  />
                ))}

                {/* Belt */}
                <g clipPath="url(#bot-body-clip)">
                  <rect x="98" y="268" width="124" height="14" fill="url(#bot-cloth)" />
                  <rect x="98" y="281" width="124" height="3" fill="#000" opacity="0.18" />
                  <line x1="98" y1="272" x2="222" y2="272" stroke="#fff" strokeOpacity="0.12" />
                </g>
                <g ref={beltTailsRef}>
                  <path d="M154 283 C151 292 147 300 144 310 L153 312 C156 302 158 293 160 284 Z" fill="url(#bot-cloth-dark)" />
                  <path d="M166 283 C170 292 175 300 180 307 L188 303 C182 296 176 290 170 282 Z" fill="url(#bot-cloth)" />
                </g>
                <rect x="149" y="264" width="22" height="22" rx="6" fill="url(#bot-cloth-dark)" />
                <path d="M152 270 Q160 266 168 270" fill="none" stroke="#ff8a86" strokeOpacity="0.5" strokeWidth="1.5" />
              </g>

              {/* Neck */}
              <rect x="144" y="190" width="32" height="26" rx="6" fill="url(#bot-metal-h)" />
              <rect x="142" y="196" width="36" height="3" rx="1.5" fill="#0c0c0f" opacity="0.6" />
              <rect x="142" y="204" width="36" height="3" rx="1.5" fill="#0c0c0f" opacity="0.6" />

              {/* Head */}
              <g ref={headRef}>
                {/* Antenna */}
                <rect x="152" y="52" width="16" height="10" rx="3" fill="url(#bot-metal-h)" />
                <line x1="160" y1="54" x2="160" y2="36" stroke="#c4c6ce" strokeWidth="2.5" strokeLinecap="round" />
                <circle
                  cx="160"
                  cy="31"
                  r="9"
                  fill={BRAND}
                  opacity="0.35"
                  filter="url(#bot-blur-sm)"
                  className="dojo-anim"
                  style={{ animation: "dojo-pulse 1.6s ease-in-out infinite" }}
                />
                <circle cx="160" cy="31" r="5" fill={BRAND} />
                <circle cx="158.5" cy="29.5" r="1.6" fill="#fff" opacity="0.8" />

                {/* Ear pods */}
                <rect x="56" y="104" width="20" height="46" rx="9" fill="url(#bot-metal)" />
                <rect x="244" y="104" width="20" height="46" rx="9" fill="url(#bot-metal)" />
                <rect x="60" y="122" width="4" height="10" rx="2" fill={BRAND} opacity="0.85" />
                <rect x="256" y="122" width="4" height="10" rx="2" fill={BRAND} opacity="0.85" />

                {/* Shell */}
                <rect x="70" y="58" width="180" height="140" rx="46" fill="url(#bot-shell)" />
                <g clipPath="url(#bot-head-clip)">
                  <ellipse cx="116" cy="74" rx="60" ry="26" fill="url(#bot-shell-hot)" />
                  <rect x="70" y="58" width="180" height="140" fill="url(#bot-rim)" />
                  <ellipse cx="160" cy="206" rx="90" ry="18" fill="#000" opacity="0.18" filter="url(#bot-blur-sm)" />

                  {/* Hachimaki headband */}
                  <path d="M66 96 Q160 84 254 96 L254 100 Q160 88 66 100 Z" fill="#000" opacity="0.2" filter="url(#bot-blur-sm)" />
                  <path d="M66 78 Q160 66 254 78 L254 94 Q160 82 66 94 Z" fill="url(#bot-cloth)" />
                  <path d="M66 81 Q160 69 254 81" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.2" />
                </g>
                <rect
                  x="70.5"
                  y="58.5"
                  width="179"
                  height="139"
                  rx="45.5"
                  fill="none"
                  stroke="#fff"
                  strokeOpacity="0.35"
                />
                <g ref={bandTailsRef}>
                  <path d="M246 82 C262 70 280 74 298 62 L302 72 C284 86 266 84 248 92 Z" fill="url(#bot-cloth)" />
                  <path d="M246 88 C262 94 272 104 290 108 L284 118 C268 110 256 100 244 94 Z" fill="url(#bot-cloth-dark)" />
                  <path d="M252 84 C266 78 280 76 294 68" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="1" />
                </g>
                <ellipse cx="246" cy="87" rx="9" ry="8" fill="url(#bot-cloth-dark)" />

                {/* Visor */}
                <rect x="86" y="94" width="148" height="88" rx="31" fill="url(#bot-bezel)" />
                <rect
                  ref={visorRef}
                  x="92"
                  y="100"
                  width="136"
                  height="76"
                  rx="26"
                  fill="url(#bot-visor)"
                />
                <g clipPath="url(#bot-visor-clip)">
                  <g ref={eyesRef}>
                    <g ref={blinkRef}>
                      {mood === "focus" ? (
                        <g stroke="url(#bot-eye)" strokeWidth="6.5" strokeLinecap="round" fill="none" filter="url(#bot-glow)">
                          <path d="M123 143 q11 -15 22 0" />
                          <path d="M175 143 q11 -15 22 0" />
                        </g>
                      ) : mood === "error" ? (
                        <g stroke="url(#bot-eye)" strokeWidth="6.5" strokeLinecap="round" filter="url(#bot-glow)">
                          <path d="M123 131 L145 141" />
                          <path d="M197 131 L175 141" />
                        </g>
                      ) : (
                        <g filter="url(#bot-glow)">
                          <rect x="124" y="121" width="20" height="30" rx="10" fill="url(#bot-eye)" />
                          <rect x="176" y="121" width="20" height="30" rx="10" fill="url(#bot-eye)" />
                        </g>
                      )}
                    </g>
                  </g>
                  <rect x="92" y="100" width="136" height="76" fill="url(#bot-scan)" />
                  {mood === "loading" ? (
                    <rect
                      x="92"
                      y="100"
                      width="136"
                      height="2.5"
                      fill={BRAND}
                      opacity="0.85"
                      filter="url(#bot-glow)"
                      className="dojo-anim"
                      style={{ animation: "dojo-scan 1.1s ease-in-out infinite alternate" }}
                    />
                  ) : null}
                  <g ref={glareRef}>
                    <path d="M100 108 Q130 100 176 102 L160 114 Q126 114 98 128 Z" fill="#fff" opacity="0.08" />
                    <path d="M206 160 Q216 150 220 136" fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="3" strokeLinecap="round" />
                  </g>
                </g>
                <rect x="92.5" y="100.5" width="135" height="75" rx="25.5" fill="none" stroke="#000" strokeOpacity="0.6" />
              </g>
            </g>
          </svg>
        </div>
      </div>

      {/* Title */}
      <div className="relative z-10 hidden px-10 pb-12 md:block lg:px-14 lg:pb-14">
        <h2 className="font-display text-[clamp(52px,6.4vw,104px)] font-extrabold leading-[0.9] tracking-[-0.045em]">
          Dojo Belt
          <br />
          Analyzer
        </h2>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
          Weekly belt progress for every student, squad and campus.
        </p>
      </div>
    </div>
  );
}
