"use client";

import { useState } from "react";

function initialsOf(name: string | null | undefined) {
  const parts = (name ?? "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function hueOf(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1)
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

/**
 * Round avatar: the Google photo when there is one (fading in once loaded),
 * otherwise initials on a gradient derived from `seed`.
 */
export function Avatar({
  src,
  name,
  seed,
  size = 40,
  ring = false,
  className = "",
}: {
  src?: string | null;
  name: string | null | undefined;
  seed: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hue = hueOf(seed);
  const showPhoto = Boolean(src) && failedSrc !== src;
  return (
    <span
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-display font-bold tracking-[-0.02em] text-white ${ring ? "ring-2 ring-surface" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, oklch(0.68 0.14 ${hue}), oklch(0.46 0.15 ${(hue + 45) % 360}))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 16px -8px oklch(0.45 0.15 ${hue})`,
      }}
    >
      {initialsOf(name)}
      {showPhoto && src ? (
        // Google-hosted photo; next/image would need a remote pattern and
        // adds nothing for a 40px avatar.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loadedSrc === src ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
    </span>
  );
}
