import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { audit, one, tx } from '@/lib/db';

const projectBody = z.object({
  project_no: z.string().trim().max(40).nullish().transform((v) => v || null),
  name: z.string().trim().min(1).max(300),
  cde: z.string().trim().max(60).nullish().transform((v) => v || null),
  type: z.string().trim().max(60).nullish().transform((v) => v || null),
  built_up_area: z.number().nonnegative().nullish().transform((v) => v ?? null),
  status: z.enum(['Not Started', 'In Progress', 'On Hold', 'Closed']).default('Not Started'),
  notes: z.string().max(5000).nullish().transform((v) => v || null),
  manager_id: z.string().uuid().nullish(),
  coordinator_ids: z.array(z.string().uuid()).default([]),
});

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const b = projectBody.parse(await json(req));
    const id = await tx(async (c) => {
      const r = await c.query(`insert into projects(project_no,name,cde,type,built_up_area,status,status_source,notes) values($1,$2,$3,$4,$5,$6,'manual',$7) returning id`,
        [b.project_no, b.name, b.cde, b.type, b.built_up_area, b.status, b.notes]);
      const pid = r.rows[0].id as string;
      await c.query(`insert into project_status_history(project_id,old_status,new_status,reason,changed_by) values($1,null,$2,'Created in portal',$3)`, [pid, b.status, me.email]);
      if (b.manager_id) await c.query(`insert into project_assignments(project_id,employee_id,role) values($1,$2,'manager')`, [pid, b.manager_id]);
      for (const e of b.coordinator_ids) await c.query(`insert into project_assignments(project_id,employee_id,role) values($1,$2,'coordinator') on conflict do nothing`, [pid, e]);
      await audit(c, me.email, 'create', 'project', pid, `Created project ${b.project_no ?? ''} ${b.name}`, undefined, b);
      return pid;
    });
    return ok({ id }, 201);
  });
}
