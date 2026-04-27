import { NextResponse } from "next/server"

export const runtime = "nodejs"

export function GET() {
  return NextResponse.json({ available: !!process.env.XAI_API_KEY })
}
