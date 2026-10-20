import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { audit, tx } from '@/lib/db';

const num = z.number().positive().nullable();
const schema = z.object({
  capacity: z.object({
    max_projects_per_coordinator: num, max_projects_per_manager: num, max_area_per_coordinator: num, max_area_per_manager: num,
    hours_per_project: num, available_hours_per_person: num,
    imbalance_ratio: z.number().min(1.1).max(5),
    count_statuses: z.array(z.enum(['Not Started', 'In Progress', 'On Hold', 'Closed'])).min(1),
  }).optional(),
  alerts: z.object({ reel_reminder_days: z.number().int().min(1).max(90), outlier_area: z.number().positive() }).optional(),
});
export async function PUT(req: Request) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const b = schema.parse(await json(req));
    await tx(async (c) => {
      for (const [k, v] of Object.entries(b)) {
        if (!v) continue;
        const before = (await c.query('select value from app_settings where key=$1', [k])).rows[0]?.value;
        await c.query('insert into app_settings(key,value,updated_at) values($1,$2,now()) on conflict (key) do update set value=excluded.value, updated_at=now()', [k, JSON.stringify(v)]);
        await audit(c, me.email, 'update', 'settings', k, `Changed ${k} settings`, before, v);
      }
    });
    return ok();
  });
}
