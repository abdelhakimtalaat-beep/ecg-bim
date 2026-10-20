import { handle, ok } from '@/lib/api';
import { ApiError, requireUser } from '@/lib/auth';
import { audit, one, tx } from '@/lib/db';
import { assertScope } from '@/lib/perm';
import { sniffImage } from '@/lib/files';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser();
    const { id } = await ctx.params;
    await assertScope(me, id, 'coordinator');
    const buf = Buffer.from(await req.arrayBuffer());
    const mime = sniffImage(buf);
    if (!mime) throw new ApiError(400, 'Only PNG, JPEG or WebP images are accepted');
    if (buf.length > 3 * 1024 * 1024) throw new ApiError(400, 'Image must be 3 MB or smaller');
    const name = decodeURIComponent(req.headers.get('x-filename') || 'photo').slice(0, 120);
    await tx(async (c) => {
      const old = (await c.query('select photo_id from projects where id=$1 for update', [id])).rows[0];
      if (!old) throw new ApiError(404, 'Project not found');
      const a = (await c.query(`insert into attachments(kind,filename,mime,size_bytes,data,created_by) values('project_photo',$1,$2,$3,$4,$5) returning id`, [name, mime, buf.length, buf, me.email])).rows[0];
      await c.query('update projects set photo_id=$1,updated_at=now() where id=$2', [a.id, id]);
      if (old.photo_id) await c.query('delete from attachments where id=$1', [old.photo_id]);
      await audit(c, me.email, 'photo', 'project', id, `Uploaded project photo (${name})`);
    });
    return ok();
  });
}
export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser();
    const { id } = await ctx.params;
    await assertScope(me, id, 'coordinator');
    await tx(async (c) => {
      const old = (await c.query('select photo_id from projects where id=$1 for update', [id])).rows[0];
      if (old?.photo_id) { await c.query('update projects set photo_id=null where id=$1', [id]); await c.query('delete from attachments where id=$1', [old.photo_id]); }
      await audit(c, me.email, 'photo', 'project', id, 'Removed project photo');
    });
    return ok();
  });
}
