import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ContextProvider from "../../context";
import { headers } from 'next/headers';
import { Toaster } from "sonner";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "Arena x402",
    template: "%s · Arena x402",
  },
  description: "Micropayment-gated APIs via HTTP 402 on Avalanche (AVAX, ARENA, GLADIUS).",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/arena.svg",
    shortcut: "/icons/arena.svg",
    apple: "/icons/arena.svg",
  },
  openGraph: {
    title: "Arena x402",
    description: "Micropayment-gated APIs via HTTP 402 on Avalanche.",
    images: [
      { url: "/assets/PAYMENT_REQUIRED.png" }
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arena x402",
    description: "Micropayment-gated APIs via HTTP 402 on Avalanche.",
    images: ["assets/PAYMENT_REQUIRED.png"],
  },
};

export default async function RootLayout({ children }) {
    const cookieHeaders = await headers();
  const cookies = cookieHeaders.get("cookie");
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
          <Toaster position="top-right" richColors />
          <ContextProvider cookies={cookies}>{children}</ContextProvider>
      </body>
    </html>
  );
}
