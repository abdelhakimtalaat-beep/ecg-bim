import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { audit, tx } from '@/lib/db';
import { projectScope } from '@/lib/perm';
import { ApiError } from '@/lib/auth';

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), status: z.enum(['Not Started', 'In Progress', 'On Hold', 'Closed']), reason: z.string().max(500).optional(), confirm: z.literal(true) }).parse(await json(req));
    for (const id of b.ids) { const s = await projectScope(me, id); if (s !== 'full' && s !== 'manager') throw new ApiError(403, 'You can only change the status of projects you manage'); }
    const changed = await tx(async (c) => {
      let n = 0;
      for (const id of b.ids) {
        const p = (await c.query('select name,status from projects where id=$1 for update', [id])).rows[0];
        if (!p || p.status === b.status) continue;
        await c.query(`update projects set status=$1,status_source='manual',updated_at=now() where id=$2`, [b.status, id]);
        await c.query('insert into project_status_history(project_id,old_status,new_status,reason,changed_by) values($1,$2,$3,$4,$5)', [id, p.status, b.status, b.reason ?? 'Bulk update', me.email]);
        await audit(c, me.email, 'status', 'project', id, `${p.name}: ${p.status} → ${b.status} (bulk)`, { status: p.status }, { status: b.status });
        n++;
      }
      return n;
    });
    return ok({ changed });
  });
}
