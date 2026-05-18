import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "六根 · Synesthesia",
  description:
    "把任意一个字、一句话，投射到眼耳鼻舌身意。用 embedding 体验佛家说的「六根互用」与脑科学里的联觉。",
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
