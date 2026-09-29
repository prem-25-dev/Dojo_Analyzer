"use client";

import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrl } from "@/lib/avatars";

/** A student's Google photo when they've signed in, else initials. */
export function StudentAvatar({
  id,
  name,
  email,
  size = 44,
  ring = false,
}: {
  id: string;
  name: string | null;
  email?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const src = useAvatarUrl(id, email);
  return <Avatar src={src} name={name} seed={id} size={size} ring={ring} />;
}
