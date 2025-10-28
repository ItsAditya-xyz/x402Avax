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
  title: "COOK",
  description: "Bet on Post's virality!",
   manifest: "/manifest.json"
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
