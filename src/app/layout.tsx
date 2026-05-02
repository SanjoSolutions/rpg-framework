import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Navbar } from "@/components/navbar"
import { DevSidebar } from "@/components/dev-sidebar"
import { DevSidebarProvider } from "@/hooks/use-dev-sidebar"
import { SettingsProvider } from "@/hooks/use-settings"
import "./globals.css"

const IS_DEV = process.env.NODE_ENV === "development"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "RPG Framework",
  description: "Local roleplay framework — define characters, locations, and scenarios; let the LLM bring them to life.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-screen overflow-hidden`}
      >
        <SettingsProvider>
          <DevSidebarProvider>
            <Navbar />
            <div className="flex flex-1 min-h-0">
              <main className="flex-1 min-w-0 overflow-auto">{children}</main>
              {IS_DEV && <DevSidebar />}
            </div>
          </DevSidebarProvider>
        </SettingsProvider>
      </body>
    </html>
  )
}
