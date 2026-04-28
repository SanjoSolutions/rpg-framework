import { NextResponse } from "next/server"
import { getXaiApiKey } from "@/lib/xai-credentials"

export const runtime = "nodejs"

export function GET() {
  return NextResponse.json({ available: !!getXaiApiKey() })
}
