import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { one, q, audit } from '@/lib/db';
import { ApiError, checkPassword, hash, requireUser, verify } from '@/lib/auth';
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = z.object({ current: z.string(), next: z.string() }).parse(await json(req));
    checkPassword(b.next);
    const u = await one<any>('select password_hash from users where id=$1', [me.id]);
    if (!(await verify(b.current, u.password_hash))) throw new ApiError(400, 'Current password is incorrect');
    await q('update users set password_hash=$1,must_change_password=false where id=$2', [await hash(b.next), me.id]);
    await audit(null, me.email, 'password', 'user', me.id, 'Password changed');
    return ok();
  });
}
