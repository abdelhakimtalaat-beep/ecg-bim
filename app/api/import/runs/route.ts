import { handle, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() { return handle(async () => { await requireUser(['admin']); return ok(await q('select id,at,source,run_by,summary from import_runs order by at desc limit 50')); }); }
