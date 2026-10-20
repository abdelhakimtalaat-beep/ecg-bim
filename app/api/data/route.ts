import { handle, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { loadDataset } from '@/lib/dataset';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => { const me = await requireUser(); return ok({ me, data: await loadDataset() }); });
}
