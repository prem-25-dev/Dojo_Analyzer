import type { ReactNode } from "react";
import { Navbar } from "@/components/navbar";

/**
 * Layout for all authenticated campus/mentor management pages.
 *
 * Route group (app) does NOT change URL paths — /imports stays /imports etc.
 *
 * This layout renders the shared glassmorphic Navbar above every page.
 * It is intentionally NOT applied to:
 *  - /login
 *  - /student
 *  - /auth/callback
 *  - API routes
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dot-matrix relative min-h-screen">
      <Navbar />
      {/* pt-4 gives comfortable clearance below the sticky navbar without excessive space */}
      <div className="relative z-10 pt-4">{children}</div>
    </div>
  );
}
