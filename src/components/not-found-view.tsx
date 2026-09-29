"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { FuzzyText } from "@/components/reactbits/fuzzy-text";
import { LightRays } from "@/components/reactbits/light-rays";
import { ShinyButton } from "@/components/ui/shiny-button";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

/**
 * Always-dark 404: a giant fuzzy "404" sinks off the bottom edge while
 * "Server not found" sits over its top.
 */
export function NotFoundView() {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 18, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <main
      data-theme="dark"
      className="relative isolate flex h-dvh min-h-[560px] flex-col overflow-hidden bg-[#09090b] text-white"
    >
      {/* Backdrop: rays, dot grid, grain, vignette */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-80">
        <LightRays
          raysOrigin="top-center"
          raysColor="#ff8a86"
          raysSpeed={0.6}
          lightSpread={0.7}
          rayLength={1.4}
          fadeDistance={0.9}
          followMouse
          mouseInfluence={0.12}
          noiseAmount={0.08}
          distortion={0.05}
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-[55%]"
        style={{
          background:
            "radial-gradient(70% 90% at 50% 100%, rgba(239,56,55,0.22), transparent 70%)",
        }}
      />

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 pt-6 sm:px-10">
        <motion.a
          href="/"
          {...rise(0)}
          className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <Image
            src="/imgs/kalvium_icon.jpg"
            alt=""
            width={30}
            height={30}
            className="rounded-lg"
          />
          <span className="font-display text-[15px] font-bold tracking-[-0.02em]">
            Dojo Belt Analyzer
          </span>
        </motion.a>
        <motion.span
          {...rise(0.05)}
          className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11.5px] text-white/60 backdrop-blur sm:flex"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="dojo-anim absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ef3837] opacity-70" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-[#ef3837]" />
          </span>
          ERR_404 · route unresolved
        </motion.span>
      </header>

      {/* Copy + actions */}
      <section className="relative z-10 mx-auto mt-[9vh] flex max-w-xl flex-col items-center px-6 text-center">
        <motion.p
          {...rise(0.1)}
          className="font-mono text-[12px] uppercase tracking-[0.28em] text-[#ff8a86]"
        >
          Lost in the dojo
        </motion.p>
        <motion.p
          {...rise(0.18)}
          className="mt-4 text-[15px] leading-7 text-white/65"
        >
          This page slipped off the mat. It may have moved, been renamed, or
          never earned its belt.
        </motion.p>
        {pathname ? (
          <motion.code
            {...rise(0.24)}
            className="mt-4 max-w-full truncate rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[12.5px] text-white/70"
          >
            <span className="text-white/35">GET </span>
            {pathname}
            <span className="ml-2 text-[#ff8a86]">404</span>
          </motion.code>
        ) : null}
        <motion.div
          {...rise(0.3)}
          className="mt-7 flex flex-wrap items-center justify-center gap-3"
        >
          <ShinyButton
            onClick={() => router.push("/")}
            className="h-11 px-5 font-display text-[14px] font-semibold"
          >
            <LayoutDashboard size={15} /> Back to dashboard
          </ShinyButton>
          <button
            type="button"
            onClick={() =>
              window.history.length > 1 ? router.back() : router.push("/")
            }
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 text-[14px] font-semibold text-white/85 backdrop-blur transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft size={15} /> Go back
          </button>
        </motion.div>
      </section>

      {/* Headline over the sinking 404 */}
      <div className="relative mt-auto">
        <motion.h1
          {...rise(0.4)}
          className="relative z-10 px-4 text-center font-display text-[clamp(2.6rem,9vw,8.5rem)] font-extrabold leading-[0.9] tracking-[-0.045em] text-white [text-shadow:0_10px_40px_rgba(0,0,0,0.55)]"
        >
          Server not found
        </motion.h1>
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="-mt-[5.5vw] mb-[-9vw] flex w-full justify-center"
        >
          <FuzzyText
            text="404"
            widthRatio={0.44}
            fontWeight={800}
            className="max-w-none font-display"
            gradient={[
              "rgba(255,255,255,0.95)",
              "rgba(255,138,134,0.9)",
              "rgba(239,56,55,0.55)",
              "rgba(239,56,55,0)",
            ]}
          />
        </motion.div>
      </div>
    </main>
  );
}
