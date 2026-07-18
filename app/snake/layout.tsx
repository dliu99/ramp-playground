import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Snake",
  description: "A tiny arcade Snake game.",
};

export default function SnakeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
