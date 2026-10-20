import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { audit, q } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => { await requireUser(['admin', 'bim_manager']); return ok(await q('select id,severity,kind,entity,message,resolved,resolved_by,resolved_at from data_issues order by resolved, case severity when \'error\' then 0 when \'warning\' then 1 else 2 end, kind, entity')); });
}
export async function PATCH(req: Request) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), resolved: z.boolean() }).parse(await json(req));
    await q('update data_issues set resolved=$1, resolved_by=$2, resolved_at=$3 where id = any($4::uuid[])', [b.resolved, b.resolved ? me.email : null, b.resolved ? new Date() : null, b.ids]);
    await audit(null, me.email, 'update', 'issues', null, `${b.resolved ? 'Resolved' : 'Re-opened'} ${b.ids.length} data issue(s)`);
    return ok();
  });
}
