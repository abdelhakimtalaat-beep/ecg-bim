'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, Info, Layers, Users } from 'lucide-react';
import { useApp } from '@/components/store';
import { FilterBar } from '@/components/FilterBar';
import { ChartBox, Datum, Donut, HBar, StatusStack, Trend, VBar, BLUES } from '@/components/charts';
import { Empty, PageHeader, Tip } from '@/components/ui';
import { buildAlerts, countByStatus, imbalanceOf, incompleteReels, personStats, reelStats, totalArea, upcomingReels, hasArea } from '@/lib/metrics';
import { fmtNum } from '@/lib/client';
import { STATUSES, STATUS_COLORS, type Status } from '@/lib/types';

function Kpi({ label, value, sub, tip, color }: { label: string; value: React.ReactNode; sub?: string; tip?: string; color?: string }) {
  return (
    <div className="card relative overflow-hidden p-4" title={tip}>
      {color && <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />}
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-brand-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data, projects, reels, filters, setFilters, today } = useApp();
  const router = useRouter();
  const projIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const asg = useMemo(() => data.assignments.filter((a) => projIds.has(a.project_id)), [data, projIds]);
  const stats = useMemo(() => personStats(data, projects), [data, projects]);
  const mgrStats = stats.filter((s) => s.role === 'manager');
  const coordStats = stats.filter((s) => s.role === 'coordinator');
  const byStatus = countByStatus(projects);
  const area = totalArea(projects);
  const withArea = projects.filter(hasArea).length;
  const rs = reelStats(reels);
  const upcoming = upcomingReels(reels, today);
  const late = incompleteReels(reels, today);
  const alerts = useMemo(() => buildAlerts(data, projects, today), [data, projects, today]);
  const act = data.employees.filter((e) => e.active);
  const count = (c: string) => act.filter((e) => e.job_category === c).length;
  const teamMembers = act.filter((e) => e.job_category !== 'department_manager').length;
  const activeAsg = asg.filter((a) => { const p = data.projects.find((x) => x.id === a.project_id); return p && p.status !== 'Closed'; }).length;
  const avgPerMgr = mgrStats.length ? projects.filter((p) => asg.some((a) => a.project_id === p.id && a.role === 'manager')).length / mgrStats.length : null;
  const avgActive = mgrStats.length ? mgrStats.reduce((t, s) => t + s.active, 0) / mgrStats.length : null;
  const minMax = mgrStats.length ? `range ${Math.min(...mgrStats.map((s) => s.projects))}–${Math.max(...mgrStats.map((s) => s.projects))}` : undefined;

  const toggle = <K extends 'manager' | 'coordinator' | 'cde' | 'type'>(k: K, v: string) => setFilters({ [k]: (filters[k] as string[]).includes(v) ? (filters[k] as string[]).filter((x) => x !== v) : [...(filters[k] as string[]), v] } as any);

  const statusData: Datum[] = STATUSES.map((s) => ({ key: s, name: s, value: byStatus[s] })).filter((d) => d.value > 0);
  const stackFor = (list: typeof mgrStats) => list.map((s) => ({ key: s.employee.id, name: s.employee.name, ...s.byStatus, value: s.projects }));
  const cdeData: Datum[] = Object.entries(projects.reduce((m: Record<string, number>, p) => { const k = p.cde || '(none)'; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, v]) => ({ key: k, name: k, value: v }));
  const typeData: Datum[] = Object.entries(projects.reduce((m: Record<string, number>, p) => { const k = p.type || '(none)'; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, v]) => ({ key: k, name: k, value: v }));
  const areaData: Datum[] = [...mgrStats].sort((a, b) => b.area - a.area).map((s) => ({ key: s.employee.id, name: s.employee.name, value: Math.round(s.area) }));
  const loadData: Datum[] = [...mgrStats].sort((a, b) => b.load - a.load).map((s) => ({ key: s.employee.id, name: s.employee.name, value: s.load }));
  const meanLoad = mgrStats.length ? mgrStats.reduce((t, s) => t + s.load, 0) / mgrStats.length : undefined;

  // reels by month and status
  const reelMonths = Object.entries(reels.reduce((m: Record<string, Record<string, number>>, r) => { const k = r.session_date.slice(0, 7); (m[k] ??= {})[r.status] = (m[k][r.status] || 0) + 1; return m; }, {})).sort().map(([k, v]) => ({ name: k, ...v }));

  // portfolio trend from status history (only months with recorded events; honest about thin history)
  const trend = useMemo(() => {
    const rows = data.history.filter((h) => projIds.has(h.project_id));
    const months = [...new Set(rows.map((h) => h.changed_at.slice(0, 7)))].sort();
    if (months.length < 2) return null;
    const out: any[] = [];
    for (const m of months) {
      const end = m + '-31T23:59:59Z'; const latest = new Map<string, Status>();
      for (const h of rows) if (h.changed_at <= end) latest.set(h.project_id, h.new_status);
      const c: any = { name: m }; for (const s of STATUSES) c[s] = 0; for (const s of latest.values()) c[s]++; out.push(c);
    }
    return out;
  }, [data.history, projIds]);

  return (
    <>
      <PageHeader title="Executive Dashboard" subtitle="Live figures from the department database. Click any chart element to filter; filters apply across the portal." />
      <FilterBar />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Total projects" value={projects.length} sub={projects.length !== data.projects.length ? `of ${data.projects.length} (filtered)` : 'unique projects'} />
        <Kpi label="Not started" value={byStatus['Not Started']} color={STATUS_COLORS['Not Started']} />
        <Kpi label="In progress" value={byStatus['In Progress']} color={STATUS_COLORS['In Progress']} />
        <Kpi label="On hold" value={byStatus['On Hold']} color={STATUS_COLORS['On Hold']} />
        <Kpi label="Closed" value={byStatus.Closed} color={STATUS_COLORS.Closed} />
        <Kpi label="Built-up area under BIM" value={fmtNum(area)} sub={`${withArea} of ${projects.length} projects have a valid area`} tip="Sum of valid numeric built-up areas of unique projects. Text or missing values are excluded." />
        <Kpi label="BIM Managers" value={count('bim_manager')} sub={`${mgrStats.length} currently manage projects`} />
        <Kpi label="BIM Coordinators" value={count('bim_coordinator')} />
        <Kpi label="BIM Specialists" value={count('bim_specialist')} sub={count('rd_engineer') ? `+ ${count('rd_engineer')} R&D BIM Engineer` : undefined} />
        <Kpi label="BIM team members" value={teamMembers} sub="active, excl. Department Manager" />
        <Kpi label="Active team assignments" value={activeAsg} sub="people × non-closed projects" tip="Assignment rows on projects that are not Closed (manager, coordinator and member roles)." />
        <Kpi label="Projects per BIM Manager" value={avgPerMgr == null ? '—' : avgPerMgr.toFixed(1)} sub={minMax ? `average · ${minMax}` : undefined} />
        <Kpi label="Avg active projects per BIM team" value={avgActive == null ? '—' : avgActive.toFixed(1)} sub="a team = manager + coordinators" tip={`Counted as active: ${data.settings.capacity.count_statuses.join(', ')}`} />
        <Kpi label="Upcoming BIM Reels" value={upcoming.length} sub={upcoming[0] ? `next: ${upcoming[0].session_date}` : 'none scheduled'} />
        <Kpi label="Past Reels without outcome" value={late.length} sub="not marked Completed / Postponed / Cancelled" tip="Past sessions whose status is still Not recorded or Planned. They are NOT assumed to have taken place." color={late.length ? '#E8A317' : undefined} />
      </div>

      {projects.length === 0 ? <Empty title="No projects match the current filters" hint="Reset the filters to see all projects." /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartBox title="Project distribution by status" subtitle="Click a slice to filter"><Donut data={statusData} colors={(k) => STATUS_COLORS[k as Status]} activeKeys={filters.status} onPick={(k) => setFilters({ status: filters.status.includes(k as Status) ? filters.status.filter((s) => s !== k) : [...filters.status, k as Status] })} /></ChartBox>
          <ChartBox title="Projects by BIM Manager" subtitle="Stacked by status · click a bar to filter" height={Math.max(280, mgrStats.length * 34 + 70)}><StatusStack data={stackFor(mgrStats)} activeKeys={filters.manager} onPick={(k) => toggle('manager', k)} /></ChartBox>
          <ChartBox title="Projects by BIM Coordinator" subtitle="Stacked by status · click a bar to filter" height={Math.max(280, coordStats.length * 34 + 70)}><StatusStack data={stackFor(coordStats)} activeKeys={filters.coordinator} onPick={(k) => toggle('coordinator', k)} /></ChartBox>
          <ChartBox title="Built-up area by BIM Manager" subtitle="Valid numeric areas of unique projects only" height={Math.max(280, areaData.length * 34 + 70)}><HBar data={areaData} color="#0F55A8" activeKeys={filters.manager} onPick={(k) => toggle('manager', k)} /></ChartBox>
          <ChartBox title="Workload distribution among BIM teams" subtitle={`Active projects (${data.settings.capacity.count_statuses.join(' + ')}) · dashed line = team average`} height={Math.max(280, loadData.length * 34 + 70)}><HBar data={loadData} mean={meanLoad} activeKeys={filters.manager} onPick={(k) => toggle('manager', k)} /></ChartBox>
          <section className="card p-4">
            <h3 className="mb-1 text-sm font-semibold text-brand-900">Workload imbalance indicators</h3>
            <p className="mb-3 text-xs text-slate-500">Relative to peers of the same role (ratio {data.settings.capacity.imbalance_ratio}×). {stats.some((s) => s.capacityPct != null) ? 'Capacity % shown where a capacity basis is configured.' : 'No capacity is configured, so these are relative comparisons, not utilisation.'}</p>
            <ul className="space-y-1.5">
              {stats.map((s) => { const im = imbalanceOf(s, stats, data.settings.capacity.imbalance_ratio); return (
                <li key={s.employee.id + s.role} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                  <span className="truncate"><b className="font-medium">{s.employee.name}</b> <span className="text-xs text-slate-500">· {s.role}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-xs"><span>{s.load} active</span>{s.capacityPct != null && <span className={s.capacityPct > 100 ? 'font-semibold text-red-600' : ''}>{s.capacityPct}%</span>}
                    <span className={`rounded px-1.5 py-0.5 ${im === 'high' ? 'bg-amber-100 text-amber-800' : im === 'low' ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-600'}`}>{im === 'high' ? 'above peers' : im === 'low' ? 'below peers' : 'in range'}</span></span>
                </li>); })}
              {!stats.length && <li className="text-sm text-slate-500">No assignments in the current selection.</li>}
            </ul>
          </section>
          <ChartBox title="Projects by CDE platform" subtitle="Click to filter"><Donut data={cdeData} colors={(_, i) => BLUES[(i * 2) % BLUES.length]} activeKeys={filters.cde} onPick={(k) => toggle('cde', k)} /></ChartBox>
          <ChartBox title="Projects by type" subtitle="Click to filter"><HBar data={typeData} activeKeys={filters.type} onPick={(k) => toggle('type', k)} /></ChartBox>
          <ChartBox title="Weekly BIM Reels by month" subtitle={`${rs.total} sessions · completion rate ${rs.completionRate == null ? '—' : Math.round(rs.completionRate * 100) + '%'} (Completed ÷ all scheduled)`}>
            {reelMonths.length ? <VBar data={reelMonths} series={['Completed', 'Planned', 'Not recorded', 'Postponed', 'Cancelled']} colors={['#2E9E5B', '#1F6FC9', '#9AA5B1', '#E8A317', '#DC2626']} /> : <Empty title="No sessions in range" />}
          </ChartBox>
          <ChartBox title="Portfolio trend over time" subtitle="Projects by status, from recorded status changes">
            {trend ? <Trend data={trend} /> : <Empty title="Not enough history yet" hint="The imported workbook has no dates. Every status change made in the portal is recorded and will build this trend month by month." />}
          </ChartBox>
        </div>
      )}

      <section className="card mt-6 p-4" aria-label="Management alerts">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-900"><AlertTriangle size={16} />Management alerts <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-600">{alerts.length}</span></h3>
        {!alerts.length ? <p className="text-sm text-slate-500">No alerts for the current selection.</p> : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id}>
                <button onClick={() => a.link && router.push(a.link)} className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left hover:shadow ${a.level === 'high' ? 'border-red-200 bg-red-50' : a.level === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-brand-200 bg-brand-50'}`}>
                  {a.level === 'info' ? <Info size={16} className="mt-0.5 shrink-0 text-brand-600" /> : <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${a.level === 'high' ? 'text-red-600' : 'text-amber-600'}`} />}
                  <span><span className="block text-sm font-medium text-slate-800">{a.title}</span>{a.detail && <span className="block text-xs text-slate-600">{a.detail}</span>}</span>
                </button>
              </li>))}
          </ul>)}
        <p className="mt-3 text-xs text-slate-500">Thresholds come from <Link className="text-brand-600 underline" href="/workload">Team Workload → Capacity settings</Link>. Where none are configured the portal shows relative comparisons only.</p>
      </section>
    </>
  );
}
