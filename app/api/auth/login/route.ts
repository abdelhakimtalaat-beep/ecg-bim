import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { one, q } from '@/lib/db';
import { ApiError, clearFails, createSession, recordFail, throttle, verify } from '@/lib/auth';
import { audit } from '@/lib/db';

export async function POST(req: Request) {
  return handle(async () => {
    const b = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(await json(req));
    const email = b.email.toLowerCase();
    const key = email + '|' + (req.headers.get('x-forwarded-for') || 'local');
    throttle(key);
    const u = await one<any>('select id,password_hash,active,must_change_password from users where email=$1', [email]);
    if (!u || !u.active || !(await verify(b.password, u.password_hash))) { recordFail(key); throw new ApiError(401, 'Invalid email or password'); }
    clearFails(key);
    await createSession(u.id);
    await q('update users set last_login_at=now() where id=$1', [u.id]);
    await audit(null, email, 'login', 'user', u.id, 'Signed in');
    return ok({ ok: true, mustChangePassword: u.must_change_password });
  });
}
