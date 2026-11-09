import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { GET as getStatus } from '@/app/api/status/route';
import { guardRequest } from '@/lib/api-guard';
import { SESSION_COOKIE, signSession } from '@/lib/auth';

afterEach(() => vi.unstubAllEnvs());

const request = () => new Request('https://local.test/api/auth');

describe('public access', () => {
  it('未设置密码或公开开关时，无 Cookie 也能通过 API 和会话检查', async () => {
    vi.stubEnv('PASSWORD', undefined);
    vi.stubEnv('PUBLIC_ACCESS', undefined);

    expect(guardRequest(request())).toBeNull();
    expect(await (await GET(request())).json()).toMatchObject({ verified: true });
    expect(await (await getStatus(request())).json()).toMatchObject({
      passwordRequired: false,
      verified: true,
    });
    expect(await (await POST(new Request(request(), { method: 'POST' }))).json()).toEqual({ success: true });
  });

  it('显式公开模式不会被遗留 PASSWORD 锁住', async () => {
    vi.stubEnv('PASSWORD', 'old-password');
    vi.stubEnv('PUBLIC_ACCESS', 'true');

    expect(guardRequest(request())).toBeNull();
    expect(await (await getStatus(request())).json()).toMatchObject({ passwordRequired: false, verified: true });
  });

  it('主动设置密码且未开启公开模式时仍校验会话', async () => {
    vi.stubEnv('PASSWORD', 'private-password');
    vi.stubEnv('PUBLIC_ACCESS', undefined);

    expect(guardRequest(request())?.status).toBe(401);
    expect(await (await getStatus(request())).json()).toMatchObject({ passwordRequired: true, verified: false });
    const { token } = signSession();
    expect(guardRequest(new Request(request(), { headers: { cookie: `${SESSION_COOKIE}=${token}` } }))).toBeNull();
  });
});
