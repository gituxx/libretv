import { NextResponse } from 'next/server';
import { isPublicAccess, sessionFromCookieHeader } from './auth';

/** API Route 共享守卫：公开站点直接访问，设有密码的站点才需要登录。 */
export function guardRequest(req: Request): NextResponse | null {
  if (isPublicAccess()) return null;
  if (!sessionFromCookieHeader(req.headers.get('cookie'))) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  return null;
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
