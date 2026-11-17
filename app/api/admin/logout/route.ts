import { NextResponse } from "next/server";
import { adminCookieName, adminMfaEnrollCookieName, adminPendingCookieName, authCookieOptions, getAdminSession } from "@/lib/admin-auth";
import { writeAudit } from "@/lib/security/audit";
import { assertSameOrigin, noStoreHeaders } from "@/lib/security/request";

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch { /* logout remains safe by clearing cookies */ }
  const session = await getAdminSession();
  const response = NextResponse.redirect(new URL("/admin/login", request.url), 303);
  noStoreHeaders(response.headers);
  response.cookies.set(adminCookieName(), "", authCookieOptions(0));
  response.cookies.set(adminPendingCookieName(), "", authCookieOptions(0));
  response.cookies.set(adminMfaEnrollCookieName(), "", authCookieOptions(0));
  await writeAudit({ request, actor: session?.email || "admin", action: "admin.logout", outcome: "success" });
  return response;
}
