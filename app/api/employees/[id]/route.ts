import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { ApiError, requireUser } from '@/lib/auth';
import { audit, tx } from '@/lib/db';
import { loadDataset } from '@/lib/dataset';
import { wouldCreateCycle } from '@/lib/metrics';

const patch = z.object({
  employee_code: z.string().trim().max(40).nullable(),
  name: z.string().trim().min(1).max(120),
  job_title: z.string().trim().min(1).max(120),
  job_category: z.enum(['department_manager', 'bim_manager', 'bim_coordinator', 'bim_specialist', 'rd_engineer', 'other']),
  discipline: z.string().trim().max(60).nullable(),
  year_value: z.number().int().min(1950).max(2100).nullable(),
  team_location: z.string().trim().max(20).nullable(),
  notes: z.string().max(2000).nullable(),
  active: z.boolean(),
  reports_to: z.string().uuid().nullable(),
}).partial();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const { id } = await ctx.params; z.string().uuid().parse(id);
    const b = patch.parse(await json(req));
    const ds = await loadDataset();
    const cur = ds.employees.find((e) => e.id === id);
    if (!cur) throw new ApiError(404, 'Employee not found');
    if ('reports_to' in b && wouldCreateCycle(ds.employees, id, b.reports_to ?? null)) throw new ApiError(400, 'That reporting line would create a loop in the hierarchy');
    await tx(async (c) => {
      const { reports_to, ...cols } = b as any;
      const keys = Object.keys(cols);
      if (keys.length) {
        const vals = keys.map((k) => cols[k]); vals.push(id);
        await c.query(`update employees set ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, updated_at=now() where id=$${vals.length}`, vals);
      }
      if ('reports_to' in b && (reports_to ?? null) !== cur.reports_to) {
        await c.query('update reporting_relationships set valid_to=current_date where employee_id=$1 and valid_to is null', [id]);
        if (reports_to) await c.query('insert into reporting_relationships(employee_id,manager_id) values($1,$2)', [id, reports_to]);
        const mgr = ds.employees.find((e) => e.id === reports_to);
        await audit(c, me.email, 'transfer', 'employee', id, `${cur.name} now reports to ${mgr?.name ?? '(nobody)'}`, { reports_to: cur.reports_to }, { reports_to });
      }
      if (keys.length) await audit(c, me.email, b.active === false ? 'deactivate' : 'update', 'employee', id, `${b.active === false ? 'Deactivated' : 'Updated'} ${cur.name}`,
        Object.fromEntries(keys.map((k) => [k, (cur as any)[k]])), Object.fromEntries(keys.map((k) => [k, cols[k]])));
    });
    return ok();
  });
}
