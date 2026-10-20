import { handle, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(['admin']);
    const limit = Math.min(1000, Number(new URL(req.url).searchParams.get('limit') || 300));
    return ok(await q('select id,at,user_email,action,entity,entity_id,summary from audit_logs order by at desc, id desc limit $1', [limit]));
  });
}
