import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Dojo Belt Analyzer",
  description: "Sign in to the Kalvium Dojo Belt Analyzer.",
};

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return children;
}
