import { handle } from '@/lib/api';
import { ApiError, requireUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { z } from 'zod';
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser();
    const { id } = await ctx.params; z.string().uuid().parse(id);
    const a = await one<any>('select mime,data,filename from attachments where id=$1', [id]);
    if (!a) throw new ApiError(404, 'File not found');
    return new Response(new Uint8Array(a.data), { headers: { 'Content-Type': a.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
  });
}
