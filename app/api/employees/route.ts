import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { audit, tx } from '@/lib/db';

const empFields = {
  employee_code: z.string().trim().max(40).nullish().transform((v) => v || null),
  name: z.string().trim().min(1).max(120),
  job_title: z.string().trim().min(1).max(120),
  job_category: z.enum(['department_manager', 'bim_manager', 'bim_coordinator', 'bim_specialist', 'rd_engineer', 'other']),
  discipline: z.string().trim().max(60).nullish().transform((v) => v || null),
  year_value: z.number().int().min(1950).max(2100).nullish().transform((v) => v ?? null),
  team_location: z.string().trim().max(20).nullish().transform((v) => v || null),
  notes: z.string().max(2000).nullish().transform((v) => v || null),
};
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const b = z.object({ ...empFields, reports_to: z.string().uuid().nullish() }).parse(await json(req));
    const id = await tx(async (c) => {
      const r = await c.query('insert into employees(employee_code,name,job_title,job_category,discipline,year_value,team_location,notes) values($1,$2,$3,$4,$5,$6,$7,$8) returning id',
        [b.employee_code, b.name, b.job_title, b.job_category, b.discipline, b.year_value, b.team_location, b.notes]);
      if (b.reports_to) await c.query('insert into reporting_relationships(employee_id,manager_id) values($1,$2)', [r.rows[0].id, b.reports_to]);
      await audit(c, me.email, 'create', 'employee', r.rows[0].id, `Added employee ${b.name}`, undefined, b);
      return r.rows[0].id;
    });
    return ok({ id }, 201);
  });
}
