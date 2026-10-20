import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { checkPassword, hash, requireUser } from '@/lib/auth';
import { audit, one, q } from '@/lib/db';

export async function GET() {
  return handle(async () => {
    await requireUser(['admin']);
    return ok(await q('select id,email,full_name,role,employee_id,active,last_login_at,created_at from users order by email'));
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const b = z.object({ email: z.string().email(), full_name: z.string().max(120).nullish(), password: z.string(), role: z.enum(['admin', 'bim_manager', 'bim_coordinator', 'viewer']), employee_id: z.string().uuid().nullish() }).parse(await json(req));
    checkPassword(b.password);
    const u = await one<{ id: string }>('insert into users(email,full_name,password_hash,role,employee_id,must_change_password) values($1,$2,$3,$4,$5,true) returning id',
      [b.email.toLowerCase(), b.full_name ?? null, await hash(b.password), b.role, b.employee_id ?? null]);
    await audit(null, me.email, 'create', 'user', u!.id, `Created user ${b.email} (${b.role})`);
    return ok({ id: u!.id }, 201);
  });
}
