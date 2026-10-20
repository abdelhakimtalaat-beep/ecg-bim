import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { ApiError, requireUser } from '@/lib/auth';
import { audit, one } from '@/lib/db';
import { weekdayOf } from '@/lib/metrics';

const reelBody = z.object({
  employee_id: z.string().uuid().nullish().transform((v) => v ?? null),
  presenter_code: z.string().trim().max(40).nullish().transform((v) => v || null),
  presenter_name: z.string().trim().min(1).max(120),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekday: z.string().optional(),
  topic: z.string().trim().max(300).nullish().transform((v) => v || null),
  status: z.enum(['Not recorded', 'Planned', 'Completed', 'Postponed', 'Cancelled']).default('Planned'),
  notes: z.string().max(4000).nullish().transform((v) => v || null),
  link: z.string().trim().max(500).nullish().transform((v) => v || null)
    .refine((v) => !v || /^https?:\/\//i.test(v), 'Link must start with http:// or https://'),
});
function checkReel(b: z.infer<typeof reelBody>) {
  const wd = weekdayOf(b.session_date);
  if (Number.isNaN(new Date(b.session_date + 'T00:00:00Z').getTime())) throw new ApiError(400, 'Invalid date');
  if (b.weekday && b.weekday !== wd) throw new ApiError(400, `${b.session_date} is a ${wd}, not ${b.weekday}`);
  return wd;
}
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const b = reelBody.parse(await json(req));
    const wd = checkReel(b);
    const r = await one<{ id: string }>(`insert into reel_sessions(employee_id,presenter_code,presenter_name,weekday,session_date,topic,status,notes,link) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [b.employee_id, b.presenter_code, b.presenter_name, wd, b.session_date, b.topic, b.status, b.notes, b.link]);
    await audit(null, me.email, 'create', 'reel', r!.id, `Added BIM Reel ${b.session_date} – ${b.presenter_name}`, undefined, b);
    return ok({ id: r!.id }, 201);
  });
}
