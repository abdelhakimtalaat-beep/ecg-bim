'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileDown, FileSpreadsheet, UserCog } from 'lucide-react';
import { useApp } from '@/components/store';
import { FilterBar, filtersToText } from '@/components/FilterBar';
import { AssignModal } from '@/components/AssignModal';
import { ProjectDetail } from '@/components/ProjectDetail';
import { Badge, Empty, PageHeader, StatusBadge, useToast } from '@/components/ui';
import { download, fmtNum } from '@/lib/client';
import { inconsistencies, personStats, totalArea, hasArea, imbalanceOf } from '@/lib/metrics';
import { STATUSES, STATUS_COLORS, type Employee, type Project } from '@/lib/types';
import { STATUS_DOT } from '@/lib/client';

export default function TeamsPage() {
  const { me, data, projects, emp, filters } = useApp(); const toast = useToast();
  const [tab, setTab] = useState<'hierarchy' | 'matrix' | 'checks'>('hierarchy');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [matrixBy, setMatrixBy] = useState<'manager' | 'coordinator'>('manager');
  const [detail, setDetail] = useState<string | null>(null); const [assign, setAssign] = useState<string | null>(null);
  const ids = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const stats = useMemo(() => personStats(data, projects), [data, projects]);
  const pById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);
  const dm = data.employees.find((e) => e.job_category === 'department_manager');

  // Department Manager → BIM Manager → BIM Coordinator → Projects
  const teams = useMemo(() => {
    const heads = data.employees.filter((e) => data.assignments.some((a) => a.employee_id === e.id && a.role === 'manager' && ids.has(a.project_id)) || (e.job_category === 'bim_manager' && e.reports_to === dm?.id));
    return heads.map((m) => {
      const myProjects = [...new Set(data.assignments.filter((a) => a.employee_id === m.id && a.role === 'manager' && ids.has(a.project_id)).map((a) => a.project_id))].map((id) => pById.get(id)!).filter(Boolean);
      const coordIds = new Set<string>();
      for (const p of myProjects) for (const a of data.assignments) if (a.project_id === p.id && a.role === 'coordinator') coordIds.add(a.employee_id);
      const coordinators = [...coordIds].map((cid) => ({ c: emp.get(cid)!, projects: myProjects.filter((p) => data.assignments.some((a) => a.project_id === p.id && a.employee_id === cid && a.role === 'coordinator')) })).filter((x) => x.c);
      const noCoord = myProjects.filter((p) => !data.assignments.some((a) => a.project_id === p.id && a.role === 'coordinator'));
      const reports = data.employees.filter((e) => e.reports_to === m.id);
      return { m, myProjects, coordinators, noCoord, reports, stat: stats.find((s) => s.employee.id === m.id && s.role === 'manager') };
    }).sort((a, b) => b.myProjects.length - a.myProjects.length);
  }, [data, ids, emp, pById, dm, stats]);
  const unassignedMgr = projects.filter((p) => !data.assignments.some((a) => a.project_id === p.id && a.role === 'manager'));
  const issues = useMemo(() => inconsistencies({ employees: data.employees, projects, assignments: data.assignments }), [data, projects]);
  const idle = data.employees.filter((e) => e.active && e.job_category !== 'department_manager' && !data.assignments.some((a) => a.employee_id === e.id));
  const dupes = useMemo(() => { const m = new Map<string, Project[]>(); for (const p of data.projects) { const k = p.name.toLowerCase().replace(/[^a-z0-9]/g, ''); m.set(k, [...(m.get(k) ?? []), p]); } return [...m.values()].filter((l) => l.length > 1 || data.assignments.filter((a) => a.project_id === l[0].id && a.role === 'manager').length > 1); }, [data]);

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canAssign = (p: Project) => me.role === 'admin' || (me.role === 'bim_manager' && data.assignments.some((a) => a.project_id === p.id && a.role === 'manager' && a.employee_id === me.employee_id));
  const chip = (p: Project) => (
    <span key={p.id} className="inline-flex items-center gap-1"><button onClick={() => setDetail(p.id)} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:border-brand-400 hover:bg-brand-50" title={`${p.name} — ${p.status}`}><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_DOT[p.status] }} /><span className="max-w-[14rem] truncate">{p.project_no ? p.project_no + ' · ' : ''}{p.name}</span></button>
      {canAssign(p) && <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600" aria-label={`Manage assignments for ${p.name}`} onClick={() => setAssign(p.id)}><UserCog size={14} /></button>}</span>
  );
  const StatusBar = ({ by }: { by: Record<string, number> }) => { const t = STATUSES.reduce((s, k) => s + (by[k] || 0), 0) || 1; return <span className="flex h-2 w-28 overflow-hidden rounded-full bg-slate-100" title={STATUSES.map((s) => `${s}: ${by[s] || 0}`).join(' · ')}>{STATUSES.map((s) => <span key={s} style={{ width: `${((by[s] || 0) / t) * 100}%`, background: STATUS_COLORS[s] }} />)}</span>; };

  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(15); doc.setTextColor(11, 37, 69); doc.text('BIM Teams & Project Assignments', 36, 40);
    doc.setFontSize(8); doc.setTextColor(100); doc.text(`Generated ${new Date().toLocaleString('en-GB')} · Filters: ${filtersToText(filters, emp)}`, 36, 54, { maxWidth: 770 });
    const body: any[] = []; for (const t of teams) { for (const c of t.coordinators) for (const p of c.projects) body.push([t.m.name, c.c.name, p.project_no ?? '', p.name, p.status, p.cde ?? '', hasArea(p) ? fmtNum(p.built_up_area) : '']); for (const p of t.noCoord) body.push([t.m.name, '(none)', p.project_no ?? '', p.name, p.status, p.cde ?? '', hasArea(p) ? fmtNum(p.built_up_area) : '']); }
    autoTable(doc, { startY: 66, head: [['BIM Manager', 'BIM Coordinator', 'No.', 'Project', 'Status', 'CDE', 'Area']], body, styles: { fontSize: 7 }, headStyles: { fillColor: [15, 85, 168] }, didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 4) { const c = ({ 'Not Started': [154, 165, 177], 'In Progress': [31, 111, 201], 'On Hold': [232, 163, 23], Closed: [46, 158, 91] } as any)[d.cell.raw]; if (c) { d.cell.styles.textColor = c; d.cell.styles.fontStyle = 'bold'; } } } });
    doc.save('ecg-bim-teams-assignments.pdf');
  };
  const exportXlsx = async () => { try { await download('/api/export/projects', { ids: projects.map((p) => p.id), format: 'xlsx', filters: filtersToText(filters, emp) }, 'ecg-bim-assignments.xlsx'); } catch (e: any) { toast(e.message, 'err'); } };

  const rowsMatrix = matrixBy === 'manager' ? teams.map((t) => ({ person: t.m, projects: t.myProjects })) :
    stats.filter((s) => s.role === 'coordinator').map((s) => ({ person: s.employee, projects: [...new Set(data.assignments.filter((a) => a.employee_id === s.employee.id && a.role === 'coordinator' && ids.has(a.project_id)).map((a) => a.project_id))].map((id) => pById.get(id)!).filter(Boolean) }));

  return (
    <>
      <PageHeader title="BIM Teams & Project Assignments" subtitle="Department Manager → BIM Manager → BIM Coordinator → Projects. Click a project for details; every assignment change is audited."
        actions={<><button className="btn-secondary" onClick={exportXlsx}><FileSpreadsheet size={16} />Excel</button><button className="btn-secondary" onClick={exportPdf}><FileDown size={16} />PDF</button></>} />
      <FilterBar show={['q', 'manager', 'coordinator', 'status', 'cde', 'type']} />
      <div className="mb-4 flex gap-1 border-b border-slate-200" role="tablist">
        {([['hierarchy', 'Team hierarchy'], ['matrix', 'Matrix'], ['checks', `Checks (${unassignedMgr.length + issues.length + dupes.length})`]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>)}
      </div>

      {tab === 'hierarchy' && (<div className="space-y-3">
        {dm && <div className="card flex items-center justify-between bg-brand-900 p-4 text-white"><div><p className="text-xs uppercase tracking-wide text-brand-200">BIM Department Manager</p><p className="font-semibold">{dm.name} <span className="text-sm font-normal text-brand-200">{dm.employee_code}</span></p></div><div className="text-right text-sm"><p>{projects.length} projects · {teams.length} teams</p><p className="text-brand-200">{fmtNum(totalArea(projects))} built-up area</p></div></div>}
        {!teams.length && <Empty title="No teams for the current filters" />}
        {teams.map((t) => { const isOpen = open.has(t.m.id); const by = { 'Not Started': 0, 'In Progress': 0, 'On Hold': 0, Closed: 0 } as Record<string, number>; t.myProjects.forEach((p) => by[p.status]++); const im = t.stat ? imbalanceOf(t.stat, stats, data.settings.capacity.imbalance_ratio) : 'balanced';
          return (
            <section key={t.m.id} className="card overflow-hidden">
              <button className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 bg-brand-50 px-4 py-3 text-left" onClick={() => toggle(t.m.id)} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span className="min-w-[12rem] flex-1"><span className="block font-semibold text-brand-900">{t.m.name} <span className="text-xs font-normal text-slate-500">{t.m.employee_code ?? 'ID not supplied'}</span></span><span className="text-xs text-slate-500">{t.m.job_title}{t.m.team_location ? ` (${t.m.team_location})` : ''}</span></span>
                <span className="text-sm"><b>{t.myProjects.length}</b> projects</span><span className="text-sm"><b>{fmtNum(totalArea(t.myProjects))}</b> area</span><StatusBar by={by} />
                <span className="text-xs text-slate-600">{t.coordinators.length} coordinator(s) · {t.reports.length} reporting</span>
                {t.stat && <span className="text-xs">{t.stat.active} active{t.stat.capacityPct != null && <b className={t.stat.capacityPct > 100 ? 'text-red-600' : ''}> · {t.stat.capacityPct}%</b>}</span>}
                {im !== 'balanced' && <Badge tone={im === 'high' ? 'amber' : 'blue'}>{im === 'high' ? 'above peers' : 'below peers'}</Badge>}
              </button>
              {isOpen && <div className="space-y-4 p-4">
                {t.reports.length > 0 && <p className="text-xs text-slate-500">Reporting to {t.m.name}: {t.reports.map((r) => `${r.name} (${r.job_title})`).join(', ')}</p>}
                {t.coordinators.map(({ c, projects: ps }) => { const cb = { 'Not Started': 0, 'In Progress': 0, 'On Hold': 0, Closed: 0 } as Record<string, number>; ps.forEach((p) => cb[p.status]++);
                  const rep = c.reports_to && c.reports_to !== t.m.id ? emp.get(c.reports_to)?.name : null;
                  return (<div key={c.id} className="rounded-lg border border-slate-200 p-3"><div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1"><b className="text-sm text-brand-800">{c.name}</b><span className="text-xs text-slate-500">{c.employee_code ?? 'ID not supplied'} · BIM Coordinator</span><span className="text-xs">{ps.length} projects · {fmtNum(totalArea(ps))} area</span><StatusBar by={cb} />{rep && <Badge tone="amber" title="The org chart says this person reports to someone else">reports to {rep} in org chart</Badge>}</div>
                    <div className="flex flex-wrap gap-1.5">{ps.map(chip)}</div></div>); })}
                {t.noCoord.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="mb-2 text-sm font-medium text-amber-800">No BIM Coordinator assigned ({t.noCoord.length})</p><div className="flex flex-wrap gap-1.5">{t.noCoord.map((p) => chip(p))}</div></div>}
              </div>}
            </section>); })}
      </div>)}

      {tab === 'matrix' && (<div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3"><div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">{(['manager', 'coordinator'] as const).map((k) => <button key={k} className={`px-3 py-1.5 ${matrixBy === k ? 'bg-brand-600 text-white' : 'bg-white'}`} onClick={() => setMatrixBy(k)}>By {k === 'manager' ? 'BIM Manager' : 'BIM Coordinator'}</button>)}</div>
          <div className="flex flex-wrap gap-3 text-xs">{STATUSES.map((s) => <span key={s} className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: STATUS_COLORS[s] }} />{s}</span>)}</div></div>
        {!rowsMatrix.length ? <Empty title="Nothing to show" /> : <div className="overflow-x-auto"><table className="w-full border-separate border-spacing-y-1.5"><tbody>{rowsMatrix.map(({ person, projects: ps }) => (
          <tr key={person.id}><th className="w-48 min-w-[11rem] pr-3 text-left align-top text-sm font-medium text-brand-900">{person.name}<span className="block text-xs font-normal text-slate-500">{ps.length} projects</span></th>
            <td><div className="flex flex-wrap gap-1">{ps.map((p) => <button key={p.id} onClick={() => setDetail(p.id)} title={`${p.project_no ?? ''} ${p.name} — ${p.status}`} aria-label={`${p.name}, ${p.status}`} className="h-6 w-6 rounded transition hover:scale-125 hover:ring-2 hover:ring-brand-900" style={{ background: STATUS_COLORS[p.status] }} />)}</div></td></tr>))}</tbody></table></div>}
        <p className="mt-3 text-xs text-slate-500">Each square is one project (a project shared by two managers appears in both rows). Hover for its name; click to open it.</p>
      </div>)}

      {tab === 'checks' && (<div className="space-y-5">
        <Check title="Projects without a BIM Manager" items={unassignedMgr.map((p) => ({ k: p.id, node: <div className="flex items-center justify-between gap-2"><span>{p.project_no} {p.name}</span><span className="flex gap-2"><StatusBadge status={p.status} />{me.role === 'admin' && <button className="btn-secondary btn-sm" onClick={() => setAssign(p.id)}>Assign</button>}</span></div> }))} none="Every project has a BIM Manager." />
        <Check title="Inconsistent reporting relationships" hint="A coordinator works on a manager's project but the org chart says they report to someone else." items={issues.map((i) => ({ k: i.project.id + i.coordinator.id + i.manager.id, node: <span><b>{i.coordinator.name}</b> is a coordinator on <b>{i.project.name}</b> (manager {i.manager.name}) but reports to <b>{i.reportsTo?.name ?? 'nobody'}</b> in the org chart.</span> }))} none="Assignments are consistent with the org chart." />
        <Check title="Possible duplicate project records" hint="Same project name, or several managers on one project. Different packages of one project number are not duplicates; review and decide." items={dupes.map((l) => ({ k: l[0].id, node: <span><b>{l[0].name}</b>{l.length > 1 ? ` — ${l.length} records (${l.map((x) => x.project_no ?? 'no number').join(', ')})` : ''} · managers: {[...new Set(data.assignments.filter((a) => l.some((x) => x.id === a.project_id) && a.role === 'manager').map((a) => emp.get(a.employee_id)?.name))].join(', ')} · statuses: {[...new Set(l.map((x) => x.status))].join(', ')}</span> }))} none="No duplicates detected." />
        <Check title="Team members with no project assignment" items={idle.map((e) => ({ k: e.id, node: <span>{e.name} <span className="text-xs text-slate-500">{e.job_title}</span></span> }))} none="Everyone has at least one assignment." />
      </div>)}

      <ProjectDetail id={detail} onClose={() => setDetail(null)} />
      {assign && <AssignModal projectId={assign} onClose={() => setAssign(null)} />}
    </>
  );
}

function Check({ title, hint, items, none }: { title: string; hint?: string; items: { k: string; node: React.ReactNode }[]; none: string }) {
  return <section className="card p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-brand-900">{title}<Badge tone={items.length ? 'amber' : 'green'}>{items.length}</Badge></h3>{hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
    {items.length ? <ul className="mt-2 divide-y divide-slate-100 text-sm">{items.map((i) => <li key={i.k} className="py-2">{i.node}</li>)}</ul> : <p className="mt-2 text-sm text-emerald-700">{none}</p>}</section>;
}
