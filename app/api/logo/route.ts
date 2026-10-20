import { handle, ok } from '@/lib/api';
import { ApiError, requireUser } from '@/lib/auth';
import { audit, one, tx } from '@/lib/db';
import { sniffImage } from '@/lib/files';

// Public so the login page can show it. Serves the logo uploaded by an administrator, otherwise the supplied /public/ecg-logo.png.
export async function GET(req: Request) {
  const a = await one<any>(`select mime,data from attachments where kind='logo' order by created_at desc limit 1`).catch(() => null);
  if (!a) return Response.redirect(new URL('/ecg-logo.png', req.url), 302);
  return new Response(new Uint8Array(a.data), { headers: { 'Content-Type': a.mime, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const buf = Buffer.from(await req.arrayBuffer());
    const mime = sniffImage(buf);
    if (!mime) throw new ApiError(400, 'Logo must be a PNG, JPEG or WebP image');
    if (buf.length > 2 * 1024 * 1024) throw new ApiError(400, 'Logo must be 2 MB or smaller');
    await tx(async (c) => {
      await c.query(`delete from attachments where kind='logo'`);
      await c.query(`insert into attachments(kind,filename,mime,size_bytes,data,created_by) values('logo','logo',$1,$2,$3,$4)`, [mime, buf.length, buf, me.email]);
      await audit(c, me.email, 'update', 'settings', 'logo', 'Replaced the organisation logo');
    });
    return ok();
  });
}
export async function DELETE() {
  return handle(async () => { const me = await requireUser(['admin']); await tx(async (c) => { await c.query(`delete from attachments where kind='logo'`); await audit(c, me.email, 'update', 'settings', 'logo', 'Restored the supplied ECG logo'); }); return ok(); });
}
