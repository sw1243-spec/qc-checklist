import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { getBranding } = await import("@/lib/config");
  const { appTitle, brandLabel } = getBranding();
  return {
    title: appTitle,
    description: `${brandLabel} ${appTitle}`,
    icons: { icon: "/favicon.png", apple: "/logo.png" },
  };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={inter.className}>
      <body>
        {/* Auralis-style static ambient glow — very subtle, nav pages only */}
        <div className="ambient-glow" aria-hidden="true">
          <div className="glow-orb glow-1" />
          <div className="glow-orb glow-2" />
          <div className="glow-orb glow-3" />
        </div>
        {children}
      </body>
    </html>
  );
}
