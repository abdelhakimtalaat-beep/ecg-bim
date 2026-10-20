import { handle, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
export async function GET() { return handle(async () => ok(await requireUser())); }
