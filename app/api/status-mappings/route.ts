import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { audit, tx } from '@/lib/db';
import { mapStatus } from '@/lib/metrics';

const schema = z.object({
  mappings: z.array(z.object({
    source_status: z.string().trim().min(1).max(60),
    activity_flag: z.enum(['', 'Active', 'Not Active']),
    target_status: z.enum(['Not Started', 'In Progress', 'On Hold', 'Closed']),
    note: z.string().max(300).nullish().transform((v) => v || null),
  })).min(1).max(60),
  reapply: z.boolean().default(false),
});
export async function PUT(req: Request) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const b = schema.parse(await json(req));
    const changed = await tx(async (c) => {
      await c.query('delete from status_mappings');
      for (const m of b.mappings) await c.query('insert into status_mappings(source_status,activity_flag,target_status,note) values($1,$2,$3,$4) on conflict do nothing', [m.source_status, m.activity_flag, m.target_status, m.note]);
      await audit(c, me.email, 'update', 'settings', 'status_mappings', `Updated status mapping (${b.mappings.length} rules)`, undefined, b.mappings);
      let n = 0;
      if (b.reapply) {
        // Only projects whose status still comes from the mapping are touched; manual changes are never overwritten.
        const rows = (await c.query(`select id,name,status,status_raw,activity_raw from projects where status_source='mapping' and status_raw is not null for update`)).rows;
        for (const p of rows) {
          const t = mapStatus(b.mappings as any, p.status_raw, p.activity_raw);
          if (t === p.status) continue;
          await c.query('update projects set status=$1, updated_at=now() where id=$2', [t, p.id]);
          await c.query(`insert into project_status_history(project_id,old_status,new_status,reason,changed_by) values($1,$2,$3,'Status mapping re-applied',$4)`, [p.id, p.status, t, me.email]);
          n++;
        }
        await audit(c, me.email, 'status', 'project', null, `Re-applied status mapping: ${n} project(s) changed`);
      }
      return n;
    });
    return ok({ changed });
  });
}
