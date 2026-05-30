import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "联觉通感",
  description:
    "把任意一个字、一句话或一张图片，转译成颜色、声音、气味、味道、触感与心绪。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body className="grain">{children}</body>
    </html>
  );
}
