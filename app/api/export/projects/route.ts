import { z } from 'zod';
import { handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { loadDataset } from '@/lib/dataset';
import { addSheet, infoSheet, newBook, sendBook } from '@/lib/xlsx';
import { csvEscape } from '@/lib/importer';
import { totalArea } from '@/lib/metrics';

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const b = z.object({ ids: z.array(z.string().uuid()).optional(), format: z.enum(['xlsx', 'csv']).default('xlsx'), filters: z.string().max(1000).optional() }).parse(await json(req));
    const ds = await loadDataset();
    const ids = b.ids ? new Set(b.ids) : null;
    const projects = ds.projects.filter((p) => !ids || ids.has(p.id));
    const emp = new Map(ds.employees.map((e) => [e.id, e]));
    const people = (pid: string, role: string) => ds.assignments.filter((a) => a.project_id === pid && a.role === role).map((a) => emp.get(a.employee_id)?.name).filter(Boolean).join(' / ');
    const head = ['Project No.', 'Project Name', 'CDE', 'Type', 'Built-Up Area', 'Status', 'Original Status', 'Original Activity Flag', 'BIM Manager', 'BIM Coordinator', 'Area Note', 'Notes', 'Last Updated'];
    const rows = projects.map((p) => [p.project_no, p.name, p.cde, p.type, p.built_up_area, p.status, p.status_raw, p.activity_raw, people(p.id, 'manager'), people(p.id, 'coordinator'), p.area_note, p.notes, new Date(p.updated_at).toISOString().slice(0, 10)]);
    if (b.format === 'csv') {
      const csv = '\uFEFF' + [head, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
      return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ecg-bim-projects.csv"' } });
    }
    const wb = newBook();
    addSheet(wb, 'Projects', head, rows as any, [12, 48, 10, 10, 14, 13, 14, 16, 22, 30, 30, 40, 12]);
    const ps = new Set(projects.map((p) => p.id));
    addSheet(wb, 'Assignments', ['Project No.', 'Project Name', 'Person', 'Employee ID', 'Role', 'Package'],
      ds.assignments.filter((a) => ps.has(a.project_id)).map((a) => { const p = projects.find((x) => x.id === a.project_id)!; const e = emp.get(a.employee_id); return [p.project_no, p.name, e?.name ?? '', e?.employee_code ?? '', a.role, a.package]; }) as any, [12, 48, 24, 12, 14, 20]);
    infoSheet(wb, 'ECG BIM Department Management Portal — project export', [
      ['Exported', new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'], ['Filters', b.filters || '(none — all projects)'],
      ['Projects', String(projects.length)], ['Total built-up area (valid numbers, unique projects)', String(Math.round(totalArea(projects)))],
      ['Note', 'Built-up area is shown only where the source held a valid number; unit is as supplied in the source workbook.']]);
    return sendBook(wb, 'ecg-bim-projects.xlsx');
  });
}
