import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { audit, q } from '@/lib/db';
import { assertScope } from '@/lib/perm';
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser();
    const { id } = await ctx.params; z.string().uuid().parse(id);
    await assertScope(me, id, 'coordinator');
    const b = z.object({ body: z.string().trim().min(1).max(5000) }).parse(await json(req));
    await q('insert into project_notes(project_id,body,author) values($1,$2,$3)', [id, b.body, me.email]);
    await audit(null, me.email, 'note', 'project', id, 'Added a management comment');
    return ok({ ok: true }, 201);
  });
}
