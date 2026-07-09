import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import enroutLogo from "@/assets/enrout_logo.png";
import "./globals.css";
import { DriverAppProviders } from "@/components/driver-app-providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Enrout Ops — Driver",
  description: "View assigned loads and update your run",
  icons: {
    icon: enroutLogo.src,
    apple: enroutLogo.src,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="app-canvas min-h-full font-sans antialiased">
        <DriverAppProviders>
          <div className="flex min-h-full flex-col">{children}</div>
        </DriverAppProviders>
      </body>
    </html>
  );
}
