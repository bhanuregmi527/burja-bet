import type { Metadata } from "next";
import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BurjaBet | Langur Burja on Solana",
  description:
    "A degen-first Solana Langur Burja (Jhandi Munda) experience with provably fair rolls, neon aesthetics, and liquidity for the house.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrains.variable} antialiased bg-[#0b1120] text-white`}
      >
        {children}
      </body>
    </html>
  );
}

