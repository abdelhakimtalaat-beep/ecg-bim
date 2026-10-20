// First-run bootstrap: creates the Department Manager (admin) account, only while the users table is empty.
import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { one, q, audit } from '@/lib/db';
import { ApiError, checkPassword, createSession, hash } from '@/lib/auth';

export async function GET() {
  return handle(async () => {
    const n = await one<{ n: number }>('select count(*)::int n from users');
    const dm = await one<{ id: string; name: string }>(`select id,name from employees where job_category='department_manager' limit 1`);
    return ok({ needsSetup: (n?.n ?? 0) === 0, departmentManager: dm?.name ?? null });
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    const n = await one<{ n: number }>('select count(*)::int n from users');
    if ((n?.n ?? 0) > 0) throw new ApiError(403, 'Setup has already been completed');
    const b = z.object({ email: z.string().email(), password: z.string() }).parse(await json(req));
    checkPassword(b.password);
    const dm = await one<{ id: string; name: string }>(`select id,name from employees where job_category='department_manager' limit 1`);
    const u = await one<{ id: string }>(`insert into users(email,full_name,password_hash,role,employee_id) values($1,$2,$3,'admin',$4) returning id`,
      [b.email.toLowerCase(), dm?.name ?? 'Administrator', await hash(b.password), dm?.id ?? null]);
    await audit(null, b.email, 'setup', 'user', u!.id, 'First administrator created');
    await createSession(u!.id);
    return ok();
  });
}
