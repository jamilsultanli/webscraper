import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Handle static asset requests properly
  if (request.nextUrl.pathname.startsWith("/_next/static/")) {
    const response = NextResponse.next()
    response.headers.set("Cache-Control", "public, max-age=31536000, immutable")
    return response
  }

  // Handle favicon requests
  if (request.nextUrl.pathname === "/favicon.ico") {
    return NextResponse.next()
  }

  // Handle API routes
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)", "/api/(.*)"],
}
