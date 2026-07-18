import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PR review room",
  description: "Understand the change before you describe it.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
