import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { ApiError, checkPassword, hash, requireUser } from '@/lib/auth';
import { audit, one, q } from '@/lib/db';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const { id } = await ctx.params; z.string().uuid().parse(id);
    const b = z.object({ role: z.enum(['admin', 'bim_manager', 'bim_coordinator', 'viewer']), active: z.boolean(), employee_id: z.string().uuid().nullable(), full_name: z.string().max(120).nullable(), password: z.string() }).partial().parse(await json(req));
    const cur = await one<any>('select email,role,active from users where id=$1', [id]);
    if (!cur) throw new ApiError(404, 'User not found');
    const demotes = (b.role && b.role !== 'admin' && cur.role === 'admin') || (b.active === false && cur.role === 'admin');
    if (demotes) {
      const n = await one<{ n: number }>(`select count(*)::int n from users where role='admin' and active and id<>$1`, [id]);
      if ((n?.n ?? 0) === 0) throw new ApiError(400, 'There must be at least one active administrator');
    }
    const sets: string[] = []; const vals: any[] = [];
    for (const k of ['role', 'active', 'employee_id', 'full_name'] as const) if (k in b) { vals.push((b as any)[k]); sets.push(`${k}=$${vals.length}`); }
    if (b.password) { checkPassword(b.password); vals.push(await hash(b.password)); sets.push(`password_hash=$${vals.length}`); sets.push('must_change_password=true'); }
    if (!sets.length) throw new ApiError(400, 'Nothing to update');
    vals.push(id);
    await q(`update users set ${sets.join(',')} where id=$${vals.length}`, vals);
    await audit(null, me.email, 'update', 'user', id, `Updated user ${cur.email}: ${Object.keys(b).map((k) => (k === 'password' ? 'password reset' : k)).join(', ')}`);
    return ok();
  });
}
