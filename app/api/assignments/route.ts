import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { ApiError, requireUser } from '@/lib/auth';
import { audit, one, tx } from '@/lib/db';
import { assertScope } from '@/lib/perm';

const body = z.object({ project_id: z.string().uuid(), employee_id: z.string().uuid(), role: z.enum(['manager', 'coordinator', 'member']), package: z.string().trim().max(120).nullish() });

async function guard(me: any, projectId: string, role: string) {
  // Admins manage everything. BIM Managers manage coordinators/members on projects they manage; only admins change the manager.
  if (role === 'manager') { if (me.role !== 'admin') throw new ApiError(403, 'Only the Department Manager can change the BIM Manager of a project'); return; }
  await assertScope(me, projectId, 'manager');
}
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = body.parse(await json(req));
    await guard(me, b.project_id, b.role);
    await tx(async (c) => {
      const names = (await c.query('select (select name from projects where id=$1) p,(select name from employees where id=$2) e', [b.project_id, b.employee_id])).rows[0];
      if (!names.p || !names.e) throw new ApiError(404, 'Project or employee not found');
      await c.query('insert into project_assignments(project_id,employee_id,role,package) values($1,$2,$3,$4)', [b.project_id, b.employee_id, b.role, b.package ?? null]);
      await audit(c, me.email, 'assign', 'project', b.project_id, `${names.e} added as ${b.role} on ${names.p}`);
    });
    return ok({ ok: true }, 201);
  });
}
export async function DELETE(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = z.object({ id: z.string().uuid() }).parse(await json(req));
    const a = await one<any>('select a.*,p.name pname,e.name ename from project_assignments a join projects p on p.id=a.project_id join employees e on e.id=a.employee_id where a.id=$1', [b.id]);
    if (!a) throw new ApiError(404, 'Assignment not found');
    await guard(me, a.project_id, a.role);
    await tx(async (c) => {
      await c.query('delete from project_assignments where id=$1', [b.id]);
      await audit(c, me.email, 'unassign', 'project', a.project_id, `${a.ename} removed as ${a.role} from ${a.pname}`);
    });
    return ok();
  });
}
