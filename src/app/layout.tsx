import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dashboard Meta Ads",
  description: "Análise de contas de anúncios da Meta (Marketing API / Graph API)",
};

// Layout raiz minimalista — não carrega o header/nav do dashboard interno,
// pois páginas públicas (ex: /r, a tela de redirect para WhatsApp) também
// passam por aqui e não podem expor a navegação/branding internos.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-page">{children}</body>
    </html>
  );
}
