import { NextResponse, type NextRequest } from "next/server";

/**
 * Vérification optimiste : sans cookie de session, les pages du Comptoir
 * renvoient vers la connexion. La vraie vérification (session valide, droits)
 * est faite côté serveur dans chaque page et chaque action.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/comptoir/connexion")) return NextResponse.next();
  if (!request.cookies.get("gps_comptoir")?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/comptoir/connexion";
    url.search =
      pathname === "/comptoir"
        ? ""
        : `?suite=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/comptoir/:path*"] };
