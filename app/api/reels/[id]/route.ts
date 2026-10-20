import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { ApiError, requireUser } from '@/lib/auth';
import { audit, one, q } from '@/lib/db';
import { weekdayOf } from '@/lib/metrics';

const patch = z.object({
  employee_id: z.string().uuid().nullable(), presenter_code: z.string().trim().max(40).nullable(), presenter_name: z.string().trim().min(1).max(120),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), weekday: z.string(), topic: z.string().trim().max(300).nullable(),
  status: z.enum(['Not recorded', 'Planned', 'Completed', 'Postponed', 'Cancelled']), notes: z.string().max(4000).nullable(),
  link: z.string().trim().max(500).nullable().refine((v) => !v || /^https?:\/\//i.test(v), 'Link must start with http:// or https://'),
}).partial();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const { id } = await ctx.params; z.string().uuid().parse(id);
    const b = patch.parse(await json(req));
    const cur = await one<any>('select session_date::text d, weekday, presenter_name from reel_sessions where id=$1', [id]);
    if (!cur) throw new ApiError(404, 'Session not found');
    const date = b.session_date ?? cur.d;
    const wd = weekdayOf(date);
    if (b.weekday && b.weekday !== wd) throw new ApiError(400, `${date} is a ${wd}, not ${b.weekday}`);
    const { weekday, ...cols } = b as any;
    const keys = Object.keys(cols);
    const vals = keys.map((k) => cols[k]);
    const sets = keys.map((k, i) => `${k}=$${i + 1}`);
    sets.push(`weekday=$${vals.length + 1}`); vals.push(wd); vals.push(id);
    await q(`update reel_sessions set ${sets.join(',')}, updated_at=now() where id=$${vals.length}`, vals);
    await audit(null, me.email, 'update', 'reel', id, `Edited BIM Reel ${date} – ${b.presenter_name ?? cur.presenter_name}`, cur, cols);
    return ok();
  });
}
export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const { id } = await ctx.params; z.string().uuid().parse(id);
    const cur = await one<any>('select session_date::text d, presenter_name from reel_sessions where id=$1', [id]);
    if (!cur) throw new ApiError(404, 'Session not found');
    await q('delete from reel_sessions where id=$1', [id]);
    await audit(null, me.email, 'delete', 'reel', id, `Deleted BIM Reel ${cur.d} – ${cur.presenter_name}`);
    return ok();
  });
}
