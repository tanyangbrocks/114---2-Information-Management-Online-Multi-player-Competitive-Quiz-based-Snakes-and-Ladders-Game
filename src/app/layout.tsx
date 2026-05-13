import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "蛇梯棋即時答題",
  description: "Next.js + Supabase 多人即時蛇梯棋與答題平台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
