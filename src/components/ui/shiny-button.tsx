/**
 * Pill button with a travelling red highlight on its border.
 * Adapted from 21st.dev "shiny-button" by designali-in. The styles live in
 * globals.css (`.shiny-cta`) instead of styled-jsx, recoloured to the brand
 * and without the external Google Fonts import.
 */

import type { ButtonHTMLAttributes } from "react";

export function ShinyButton({
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`shiny-cta ${className}`} {...rest}>
      <span className="inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
