"use client";

import { startTransition, useEffect, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { supabase } from "@/lib/supabase/client";
import { DojoStage, type BotMood } from "@/components/dojo-stage";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isButtonActive, setIsButtonActive] = useState(false);

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("error");

    if (authError) {
      startTransition(() => setError(authError));
    }

    let isMounted = true;

    async function redirectAuthenticatedUser() {
      const currentUser = await getCurrentUserProfile();
      if (!isMounted || currentUser.status !== "authenticated") return;
      window.location.replace(
        currentUser.profile.role === "student" ? "/leaderboard" : "/",
      );
    }

    redirectAuthenticatedUser();

    return () => {
      isMounted = false;
    };
  }, []);

  async function signInWithGoogle() {
    setError("");
    setIsLoading(true);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
    }
  }

  const mood: BotMood = isLoading
    ? "loading"
    : error
      ? "error"
      : isButtonActive
        ? "focus"
        : "idle";

  return (
    <main className="grid min-h-screen bg-surface text-ink lg:h-screen lg:grid-cols-[minmax(0,7fr)_minmax(400px,3fr)]">
      <section className="lg:h-screen">
        <DojoStage mood={mood} />
      </section>

      <section className="flex flex-col px-6 py-8 sm:px-12 lg:py-12">
        <div className="mx-auto flex w-full max-w-[340px] flex-1 flex-col justify-center py-4 lg:py-12">
          <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em]">
            Sign in
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Use the Google account your campus team invited.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-8 border-l-2 border-action bg-brand-soft px-4 py-3 text-[13px] font-medium text-brand-text"
            >
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={isLoading}
            onPointerEnter={() => setIsButtonActive(true)}
            onPointerLeave={() => setIsButtonActive(false)}
            onFocus={() => setIsButtonActive(true)}
            onBlur={() => setIsButtonActive(false)}
            className="group mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-line-strong bg-surface px-4 text-[14px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:cursor-wait disabled:opacity-70"
          >
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-ink" />
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]">
                <path
                  fill="#4285F4"
                  d="M21.35 12.23c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.26Z"
                />
                <path
                  fill="#34A853"
                  d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.53A9.74 9.74 0 0 0 12 21.5Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.53 13.58a5.86 5.86 0 0 1 0-3.16V7.89H3.28a9.75 9.75 0 0 0 0 8.22l3.25-2.53Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 6.39c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.46 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.72 5.39l3.25 2.53C7.3 8.11 9.46 6.39 12 6.39Z"
                />
              </svg>
            )}
            {isLoading ? "Connecting to Google…" : "Continue with Google"}
          </button>

          <div className="mt-10 border-t border-line pt-6 text-[12.5px] leading-relaxed text-muted">
            Access is invite-only. Can&apos;t get in? Ask your campus manager to
            add your email.
          </div>
        </div>

        <p className="text-[12px] text-faint">© Kalvium</p>
      </section>
    </main>
  );
}
