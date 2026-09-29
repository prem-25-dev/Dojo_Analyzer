/**
 * Wraps a trigger (give it the `offer-trigger` class) so hovering slides two
 * small drawers out above and below it.
 * Adapted from 21st.dev "offer-button": corner brackets removed, styles live
 * in globals.css (`.offer-*`) instead of styled-components, palette colours.
 */

import type { ReactNode } from "react";

export function OfferHover({
  topDrawerText,
  bottomDrawerText,
  children,
  className = "",
}: {
  topDrawerText: string;
  bottomDrawerText: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`offer-container ${className}`}>
      <span aria-hidden="true" className="offer-drawer offer-drawer-top">
        {topDrawerText}
      </span>
      <span aria-hidden="true" className="offer-drawer offer-drawer-bottom">
        {bottomDrawerText}
      </span>
      {children}
    </span>
  );
}
