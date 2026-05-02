import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { cookies } from "next/headers"
import { Container } from "@/components/container"
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const devSidebarCookie = cookieStore.get("rpg-dev-sidebar-collapsed")
  const devSidebarCollapsed = devSidebarCookie?.value !== "false"

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-screen overflow-hidden`}
      >
        <SettingsProvider>
          <DevSidebarProvider
            initialCollapsed={devSidebarCollapsed}
            initialCollapsedKnown={devSidebarCookie != null}
          >
            <Navbar />
            <div className="relative flex flex-1 min-h-0">
              <main className="flex-1 min-w-0 overflow-auto">
                <Container className="h-full">{children}</Container>
              </main>
              {IS_DEV && (
                <div className="absolute inset-y-0 right-0 z-50">
                  <DevSidebar />
                </div>
              )}
            </div>
          </DevSidebarProvider>
        </SettingsProvider>
      </body>
    </html>
  )
}
