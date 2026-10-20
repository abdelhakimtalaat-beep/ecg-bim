// Validates (dryRun) or applies a project import. Never overwrites existing records: duplicates are reported and skipped.
import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { audit, q, tx } from '@/lib/db';
import { loadDataset } from '@/lib/dataset';
import { normFlag, normKey, parseArea, resolvePerson, splitPeople } from '@/lib/importer';
import { mapStatus } from '@/lib/metrics';

const schema = z.object({
  filename: z.string().max(200),
  mapping: z.record(z.string(), z.number().int().nullable()),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(3000),
  dryRun: z.boolean(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser(['admin']);
    const b = schema.parse(await json(req));
    const ds = await loadDataset();
    const aliases = await q<{ alias: string; employee_id: string }>('select alias,employee_id from employee_aliases');
    const get = (row: any[], f: string) => { const i = b.mapping[f]; return i == null ? null : row[i] ?? null; };
    const existing = new Map<string, string>();
    for (const p of ds.projects) { existing.set(`${(p.project_no || '').toLowerCase()}|${normKey(p.name)}`, p.id); }
    const seenInFile = new Set<string>();

    type R = { line: number; status: 'new' | 'duplicate' | 'invalid' | 'ignored'; messages: string[]; data?: any };
    const results: R[] = [];
    b.rows.forEach((row, i) => {
      const line = i + 2;
      const name = (get(row, 'name') ?? '').toString().replace(/\s+/g, ' ').trim();
      const mgrRaw = get(row, 'manager'), coordRaw = get(row, 'coordinator');
      if (!name) { results.push({ line, status: 'ignored', messages: ['No project name (blank or subtotal row)'] }); return; }
      const messages: string[] = [];
      const no = get(row, 'project_no') == null ? null : String(get(row, 'project_no')).trim() || null;
      const { value: area, note } = parseArea(get(row, 'area'));
      if (note) messages.push(`Area: ${note}`);
      if (!no) messages.push('Missing project number');
      const mgr = mgrRaw ? resolvePerson(String(mgrRaw), ds.employees, aliases) : null;
      if (mgrRaw && !mgr) messages.push(`BIM Manager "${mgrRaw}" not found in the org chart (assignment skipped)`);
      if (!mgrRaw) messages.push('No BIM Manager');
      const coordNames = splitPeople(coordRaw == null ? null : String(coordRaw));
      const coords: string[] = [];
      for (const n of coordNames) { const id = resolvePerson(n, ds.employees, aliases); if (id) coords.push(id); else messages.push(`BIM Coordinator "${n}" not found in the org chart (assignment skipped)`); }
      if (!coordNames.length) messages.push('No BIM Coordinator');
      const rawStatus = get(row, 'status') == null ? null : String(get(row, 'status')).trim();
      const flag = get(row, 'activity') == null ? null : String(get(row, 'activity'));
      const status = mapStatus(ds.mappings, rawStatus, flag);
      if (rawStatus && !ds.mappings.some((m) => m.source_status.toLowerCase() === rawStatus.toLowerCase())) messages.push(`Status "${rawStatus}" has no mapping (set to Not Started)`);
      const key = `${(no || '').toLowerCase()}|${normKey(name)}`;
      const dup = existing.get(key) || (seenInFile.has(key) ? 'in-file' : null);
      seenInFile.add(key);
      const data = { project_no: no, name, cde: get(row, 'cde') ? String(get(row, 'cde')).trim() : null, type: get(row, 'type') ? String(get(row, 'type')).trim() : null,
        area, area_raw: get(row, 'area') == null ? null : String(get(row, 'area')), area_note: note, status_raw: rawStatus, activity_raw: flag ? normFlag(flag) : null, status, mgr, coords };
      results.push({ line, status: dup ? 'duplicate' : 'new', messages: dup ? [`Duplicate of an existing ${dup === 'in-file' ? 'row in this file' : 'project'} (same number and name)`, ...messages] : messages, data });
    });

    const summary = { new: results.filter((r) => r.status === 'new').length, duplicate: results.filter((r) => r.status === 'duplicate').length,
      ignored: results.filter((r) => r.status === 'ignored').length, withWarnings: results.filter((r) => r.status === 'new' && r.messages.length).length };
    if (b.dryRun) return ok({ dryRun: true, summary, results: results.map(({ data, ...r }) => ({ ...r, name: data?.name })) });

    await tx(async (c) => {
      for (const r of results) {
        if (r.status !== 'new') continue;
        const d = r.data;
        const p = (await c.query(`insert into projects(project_no,name,cde,type,built_up_area,area_raw,area_note,status_raw,activity_raw,status,status_source,source_rows)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'mapping',$11) returning id`, [d.project_no, d.name, d.cde, d.type, d.area, d.area_raw, d.area_note, d.status_raw, d.activity_raw, d.status, [r.line]])).rows[0];
        await c.query(`insert into project_status_history(project_id,old_status,new_status,reason,changed_by) values($1,null,$2,$3,$4)`, [p.id, d.status, `Imported from ${b.filename}`, me.email]);
        if (d.mgr) await c.query(`insert into project_assignments(project_id,employee_id,role,source_row) values($1,$2,'manager',$3) on conflict do nothing`, [p.id, d.mgr, r.line]);
        for (const e of d.coords) await c.query(`insert into project_assignments(project_id,employee_id,role,source_row) values($1,$2,'coordinator',$3) on conflict do nothing`, [p.id, e, r.line]);
      }
      const run = (await c.query('insert into import_runs(source,run_by,summary) values($1,$2,$3) returning id', [b.filename, me.email, summary])).rows[0];
      for (const r of results) for (const m of r.messages) if (r.status !== 'ignored')
        await c.query('insert into data_issues(import_run,severity,kind,entity,message) values($1,$2,$3,$4,$5)', [run.id, r.status === 'duplicate' ? 'warning' : 'info', r.status === 'duplicate' ? 'duplicate_project_row' : 'import_note', `${b.filename} line ${r.line} ${r.data?.name ?? ''}`, m]);
      await audit(c, me.email, 'import', 'project', run.id, `Imported ${summary.new} project(s) from ${b.filename} (${summary.duplicate} duplicates skipped)`);
    });
    return ok({ dryRun: false, summary, results: results.map(({ data, ...r }) => ({ ...r, name: data?.name })) });
  });
}
