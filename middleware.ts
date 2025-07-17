import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Allow all static assets to pass through
  if (
    request.nextUrl.pathname.startsWith("/_next/static/") ||
    request.nextUrl.pathname.startsWith("/_next/image") ||
    request.nextUrl.pathname === "/favicon.ico"
  ) {
    return NextResponse.next()
  }

  // Handle API routes
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
}
