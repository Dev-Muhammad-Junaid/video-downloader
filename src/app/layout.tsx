import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// SF Pro is the real UI font on macOS and comes from -apple-system; Inter is
// only the fallback for non-Apple platforms, chosen because its metrics are
// the closest match so layout doesn't shift between the two.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Mono is now scoped to content that is genuinely monospace — URLs, file
// paths, timecodes — instead of being the app-wide UI font.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SnapDown",
  description: "Social media video and post downloader",
};

import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppToolbar } from "@/components/app-toolbar";
import { ErrorBoundary } from "@/components/error-boundary";
import { OnboardingModal } from "@/components/onboarding-modal";
import { PlatformClass } from "@/components/platform-class";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Preload subtitle-editor fonts so the style picker sample text renders correctly */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Lora&family=Nunito&family=Oswald&family=Roboto&family=Space+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <PlatformClass />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delay={400}>
            <SidebarProvider>
              <AppSidebar />
              <main className="flex h-svh w-full min-w-0 flex-1 flex-col overflow-hidden">
                <AppToolbar />
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  <ErrorBoundary>
                    {children}
                  </ErrorBoundary>
                </div>
              </main>
            </SidebarProvider>
            <Toaster />
            <OnboardingModal />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
