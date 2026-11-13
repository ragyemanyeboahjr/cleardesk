import { NextResponse, type NextRequest } from "next/server";

// First line of defence only: bounce visitors with no session cookie away from
// the portal. Real checks (valid session, correct role, own data) happen on
// the server in every page, action and route via src/lib/auth.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("cd_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/admin/:path*"] };
