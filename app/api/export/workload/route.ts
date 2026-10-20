import { z } from 'zod';
import { handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { loadDataset } from '@/lib/dataset';
import { addSheet, infoSheet, newBook, sendBook } from '@/lib/xlsx';
import { imbalanceOf, personStats } from '@/lib/metrics';

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const b = z.object({ ids: z.array(z.string().uuid()).optional(), filters: z.string().max(1000).optional() }).parse(await json(req));
    const ds = await loadDataset();
    const ids = b.ids ? new Set(b.ids) : null;
    const projects = ds.projects.filter((p) => !ids || ids.has(p.id));
    const stats = personStats(ds, projects);
    const cap = ds.settings.capacity;
    const mk = (role: 'manager' | 'coordinator') => stats.filter((s) => s.role === role).map((s) => [s.employee.name, s.employee.employee_code, s.projects, s.byStatus['In Progress'], s.byStatus['Not Started'], s.byStatus['On Hold'], s.byStatus.Closed,
      s.active, s.activeAssignments, Math.round(s.area), s.areaMissing, s.reports, s.capacityPct == null ? 'n/a (no capacity defined)' : s.capacityPct + '%', s.capacityBasis ?? '', s.relative == null ? '' : Number(s.relative.toFixed(2)), imbalanceOf(s, stats, cap.imbalance_ratio)]);
    const head = ['Name', 'Employee ID', 'Assigned projects', 'In Progress', 'Not Started', 'On Hold', 'Closed', 'Counted active projects', 'Active assignments', 'Built-up area (unique projects)', 'Projects without area', 'Direct reports', 'Capacity %', 'Capacity basis', 'Relative index (vs peer mean)', 'Relative balance'];
    const wb = newBook();
    addSheet(wb, 'BIM Managers', head, mk('manager') as any);
    addSheet(wb, 'BIM Coordinators', head, mk('coordinator') as any);
    infoSheet(wb, 'ECG BIM Team Workload report', [
      ['Calculated', new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'], ['Filters', b.filters || '(none — all projects)'], ['Projects included', String(projects.length)],
      ['Counted as active', cap.count_statuses.join(', ')],
      ['Capacity definition', [cap.max_projects_per_manager && `max ${cap.max_projects_per_manager} active projects / manager`, cap.max_projects_per_coordinator && `max ${cap.max_projects_per_coordinator} active projects / coordinator`,
        cap.max_area_per_manager && `max area ${cap.max_area_per_manager} / manager`, cap.max_area_per_coordinator && `max area ${cap.max_area_per_coordinator} / coordinator`,
        cap.hours_per_project && cap.available_hours_per_person && `${cap.hours_per_project} h per project, ${cap.available_hours_per_person} h available`].filter(Boolean).join('; ') || 'NOT DEFINED — percentages are not shown; only relative comparisons.'],
      ['Imbalance ratio', String(cap.imbalance_ratio)],
      ['Assumptions', 'Project count and built-up area are PROXIES for workload, not measured effort. A project assigned to a person is counted once. Area uses valid numeric values only.']]);
    return sendBook(wb, 'ecg-bim-workload.xlsx');
  });
}
