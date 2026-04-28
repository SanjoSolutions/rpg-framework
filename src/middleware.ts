import { NextResponse, type NextRequest } from "next/server"
import { ensureFreshActivation, getValidActivation } from "@/lib/activation"

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/|favicon\\.ico|audio/).*)"],
}

const PUBLIC_PREFIXES = ["/activate", "/api/activation"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  const activation = getValidActivation()
  if (!activation) return blockResponse(request)

  const stillActive = await ensureFreshActivation()
  if (!stillActive) return blockResponse(request)

  return NextResponse.next()
}

function blockResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "App is not activated" }, { status: 401 })
  }
  const url = request.nextUrl.clone()
  url.pathname = "/activate"
  url.search = ""
  return NextResponse.redirect(url)
}
