import { type NextRequest, NextResponse } from "next/server"
import { crawlCache } from "@/lib/cache"

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      cacheSize: crawlCache.size(),
      message: "Cache is working properly",
    })
  } catch (error) {
    console.error("Cache status error:", error)
    return NextResponse.json({ error: "Cache error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get("domain")

    if (domain) {
      crawlCache.clear(domain)
      return NextResponse.json({ message: `Cache cleared for domain: ${domain}` })
    } else {
      crawlCache.clear()
      return NextResponse.json({ message: "All cache cleared" })
    }
  } catch (error) {
    console.error("Cache clear error:", error)
    return NextResponse.json({ error: "Failed to clear cache" }, { status: 500 })
  }
}
