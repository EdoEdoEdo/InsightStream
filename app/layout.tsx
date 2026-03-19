import type { Metadata } from "next";
import { DM_Mono, Syne } from "next/font/google";
import "./globals.css";

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "InsightStream — European Economic Intelligence",
  description:
    "Dashboard AI per l'analisi macroeconomica europea in linguaggio naturale. Dati live Eurostat.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%2307080d'/><rect x='4' y='16' width='5' height='12' rx='1' fill='%2300d4ff' opacity='.9'/><rect x='13' y='10' width='5' height='18' rx='1' fill='%2300d4ff' opacity='.7'/><rect x='22' y='4' width='5' height='24' rx='1' fill='%2300d4ff' opacity='.5'/></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={`${dmMono.variable} ${syne.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
