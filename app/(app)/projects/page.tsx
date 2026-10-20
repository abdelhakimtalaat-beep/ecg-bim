'use client';
import { Suspense, useMemo, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, LayoutGrid, Plus, Table2, Upload } from 'lucide-react';
import { useApp } from '@/components/store';
import { FilterBar, filtersToText } from '@/components/FilterBar';
import { Badge, Col, DataTable, Empty, Field, Modal, PageHeader, StatusBadge, useToast } from '@/components/ui';
import { ProjectDetail, ProjectPhoto } from '@/components/ProjectDetail';
import { ImportWizard } from '@/components/ImportWizard';
import { api, download, fmtDate, fmtNum } from '@/lib/client';
import { hasArea, totalArea } from '@/lib/metrics';
import { STATUSES, type Project, type Status } from '@/lib/types';

function Inner() {
  const { me, data, projects, filters, emp, refresh } = useApp(); const toast = useToast();
  const sp = useSearchParams(); const router = useRouter();
  const [view, setView] = useState<'cards' | 'table'>('table');
  const [sort, setSort] = useState<'name' | 'area' | 'status' | 'manager'>('name');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(sp.get('id'));
  const [bulk, setBulk] = useState<Status | ''>(''); const [bulkReason, setBulkReason] = useState(''); const [confirmBulk, setConfirmBulk] = useState(false);
  const [adding, setAdding] = useState(false); const [importing, setImporting] = useState(false);
  useEffect(() => { setOpenId(sp.get('id')); }, [sp]);
  useEffect(() => { try { const v = localStorage.getItem('ecg_proj_view'); if (v === 'cards' || v === 'table') setView(v); } catch {} }, []);

  const mgrOf = useMemo(() => { const m = new Map<string, string>(); const c = new Map<string, string>();
    for (const a of data.assignments) { const n = emp.get(a.employee_id)?.name; if (!n) continue; const t = a.role === 'manager' ? m : a.role === 'coordinator' ? c : null; if (t) t.set(a.project_id, t.has(a.project_id) ? t.get(a.project_id) + ' / ' + n : n); }
    return { m, c }; }, [data.assignments, emp]);
  const sharedNo = useMemo(() => { const c = new Map<string, number>(); for (const p of data.projects) if (p.project_no) c.set(p.project_no.toLowerCase(), (c.get(p.project_no.toLowerCase()) || 0) + 1); return c; }, [data.projects]);
  const setV = (v: 'cards' | 'table') => { setView(v); try { localStorage.setItem('ecg_proj_view', v); } catch {} };
  const open = (id: string | null) => { setOpenId(id); router.replace(id ? `/projects?id=${id}` : '/projects', { scroll: false }); };

  const sorted = useMemo(() => {
    const order: Record<string, number> = { 'In Progress': 0, 'Not Started': 1, 'On Hold': 2, Closed: 3 };
    const f: Record<string, (p: Project) => any> = { name: (p) => p.name.toLowerCase(), area: (p) => -(p.built_up_area ?? -1), status: (p) => order[p.status], manager: (p) => (mgrOf.m.get(p.id) || 'zzz').toLowerCase() };
    return [...projects].sort((a, b) => (f[sort](a) > f[sort](b) ? 1 : f[sort](a) < f[sort](b) ? -1 : 0));
  }, [projects, sort, mgrOf]);

  const cols: Col<Project>[] = [
    { key: 'no', header: 'Project No.', render: (p) => <span className="whitespace-nowrap">{p.project_no ?? <Badge tone="amber">missing</Badge>}{p.project_no && (sharedNo.get(p.project_no.toLowerCase()) || 0) > 1 && <span title="This project number is shared by several project records (packages or duplicates)"> <Badge tone="amber">shared</Badge></span>}</span>, sort: (p) => p.project_no },
    { key: 'name', header: 'Project name', render: (p) => <span className="font-medium text-brand-900">{p.name}</span>, sort: (p) => p.name.toLowerCase(), className: 'min-w-[16rem]' },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} />, sort: (p) => p.status },
    { key: 'mgr', header: 'BIM Manager', render: (p) => mgrOf.m.get(p.id) ?? <Badge tone="red">none</Badge>, sort: (p) => mgrOf.m.get(p.id) ?? '' },
    { key: 'coord', header: 'BIM Coordinator', render: (p) => mgrOf.c.get(p.id) ?? '—', sort: (p) => mgrOf.c.get(p.id) ?? '', hideBelow: 'md' },
    { key: 'cde', header: 'CDE', render: (p) => p.cde ?? '—', sort: (p) => p.cde, hideBelow: 'md' },
    { key: 'type', header: 'Type', render: (p) => p.type ?? '—', sort: (p) => p.type, hideBelow: 'lg' },
    { key: 'area', header: 'Built-up area', render: (p) => (hasArea(p) ? fmtNum(p.built_up_area) : <span title={p.area_note ?? 'Missing'} className="text-slate-400">{p.area_raw ? `“${p.area_raw}”` : '—'}</span>), sort: (p) => p.built_up_area, className: 'text-right', hideBelow: 'md' },
    { key: 'src', header: 'Workbook status', render: (p) => <span className="text-xs text-slate-500">{p.status_raw ?? '—'}{p.activity_raw ? ` / ${p.activity_raw}` : ''}</span>, hideBelow: 'lg' },
    { key: 'upd', header: 'Updated', render: (p) => fmtDate(p.updated_at), sort: (p) => p.updated_at, hideBelow: 'lg' },
  ];
  const doExport = async (format: 'xlsx' | 'csv') => { try { await download('/api/export/projects', { ids: projects.map((p) => p.id), format, filters: filtersToText(filters, emp) }, `ecg-bim-projects.${format}`); } catch (e: any) { toast(e.message, 'err'); } };
  const runBulk = async () => { try { const r = await api('/api/projects/bulk', { body: { ids: [...sel], status: bulk, reason: bulkReason || undefined, confirm: true } }); toast(`${r.changed} project(s) updated`); setSel(new Set()); setBulk(''); setBulkReason(''); setConfirmBulk(false); refresh(); } catch (e: any) { toast(e.message, 'err'); setConfirmBulk(false); } };

  return (
    <>
      <PageHeader title="Projects Portfolio" subtitle={`${projects.length} of ${data.projects.length} projects · ${fmtNum(totalArea(projects))} total valid built-up area (${projects.filter(hasArea).length} projects with a valid area)`}
        actions={<><div className="flex overflow-hidden rounded-lg border border-slate-300"><button className={`px-3 py-2 text-sm ${view === 'cards' ? 'bg-brand-600 text-white' : 'bg-white'}`} onClick={() => setV('cards')} aria-pressed={view === 'cards'}><LayoutGrid size={16} /></button><button className={`px-3 py-2 text-sm ${view === 'table' ? 'bg-brand-600 text-white' : 'bg-white'}`} onClick={() => setV('table')} aria-pressed={view === 'table'}><Table2 size={16} /></button></div>
          <button className="btn-secondary" onClick={() => doExport('xlsx')}><FileSpreadsheet size={16} />Excel</button><button className="btn-secondary" onClick={() => doExport('csv')}><Download size={16} />CSV</button>
          {me.role === 'admin' && <><button className="btn-secondary" onClick={() => setImporting(true)}><Upload size={16} />Import</button><button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} />New project</button></>}</>} />
      <FilterBar show={['q', 'manager', 'coordinator', 'status', 'cde', 'type', 'area']} />

      {view === 'cards' && <div className="mb-3 flex items-center gap-2 text-sm"><span className="text-slate-500">Sort by</span>
        <select className="input w-44" value={sort} onChange={(e) => setSort(e.target.value as any)}><option value="name">Name</option><option value="area">Built-up area</option><option value="status">Status</option><option value="manager">BIM Manager</option></select></div>}

      {sel.size > 0 && <div className="card no-print mb-3 flex flex-wrap items-center gap-2 border-brand-300 bg-brand-50 p-3"><b className="text-sm">{sel.size} selected</b>
        <select className="input w-40" value={bulk} onChange={(e) => setBulk(e.target.value as any)}><option value="">Set status…</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <button className="btn-primary btn-sm" disabled={!bulk} onClick={() => setConfirmBulk(true)}>Apply</button><button className="btn-ghost btn-sm" onClick={() => setSel(new Set())}>Clear selection</button></div>}

      {!projects.length ? <Empty title="No projects match" hint="Adjust or reset the filters." /> : view === 'table'
        ? <DataTable rows={sorted} cols={cols} rowKey={(p) => p.id} onRow={(p) => open(p.id)} selectable={me.role !== 'viewer'} selected={sel} onSelect={setSel} pageSize={25} />
        : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{sorted.slice(0, 60).map((p) => (
            <button key={p.id} onClick={() => open(p.id)} className="card overflow-hidden text-left transition hover:shadow-lg"><ProjectPhoto project={p} className="h-36 w-full" />
              <div className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold leading-snug text-brand-900">{p.name}</h3><StatusBadge status={p.status} className="shrink-0" /></div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><dt className="text-slate-500">Project no.</dt><dd>{p.project_no ?? '—'}</dd><dt className="text-slate-500">Built-up area</dt><dd>{hasArea(p) ? fmtNum(p.built_up_area) : '—'}</dd>
                  <dt className="text-slate-500">BIM Manager</dt><dd className="truncate">{mgrOf.m.get(p.id) ?? '—'}</dd><dt className="text-slate-500">BIM Coordinator</dt><dd className="truncate">{mgrOf.c.get(p.id) ?? '—'}</dd><dt className="text-slate-500">CDE · Type</dt><dd>{p.cde ?? '—'} · {p.type ?? '—'}</dd><dt className="text-slate-500">Last updated</dt><dd>{fmtDate(p.updated_at)}</dd></dl></div></button>))}
            {sorted.length > 60 && <p className="col-span-full text-center text-sm text-slate-500">Showing the first 60 cards. Use the table view or filters to see all {sorted.length}.</p>}</div>}

      <ProjectDetail id={openId} onClose={() => open(null)} />
      <Modal open={confirmBulk} onClose={() => setConfirmBulk(false)} title="Confirm bulk status update" footer={<><button className="btn-secondary" onClick={() => setConfirmBulk(false)}>Cancel</button><button className="btn-primary" onClick={runBulk}>Change {sel.size} project(s) to {bulk}</button></>}>
        <p className="mb-3 text-sm">You are about to set <b>{sel.size}</b> project(s) to <b>{bulk}</b>. Each change is written to the status history and the audit log.</p><Field label="Reason (optional)"><input className="input" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} /></Field></Modal>
      {adding && <NewProject onClose={() => setAdding(false)} />}
      <ImportWizard open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const { data, refresh } = useApp(); const toast = useToast();
  const [f, setF] = useState<any>({ project_no: '', name: '', cde: 'ACC', type: 'BIM', built_up_area: '', status: 'Not Started', manager_id: '', coordinator_id: '', notes: '' });
  const people = (c: string) => data.employees.filter((e) => e.active && e.job_category === c);
  return (
    <Modal open onClose={onClose} wide title="New project" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.name.trim()} onClick={async () => {
      try { await api('/api/projects', { body: { project_no: f.project_no || null, name: f.name, cde: f.cde || null, type: f.type || null, built_up_area: f.built_up_area === '' ? null : Number(f.built_up_area), status: f.status, notes: f.notes || null, manager_id: f.manager_id || null, coordinator_ids: f.coordinator_id ? [f.coordinator_id] : [] } }); toast('Project created'); await refresh(); onClose(); } catch (e: any) { toast(e.message, 'err'); } }}>Create</button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Project number" hint="Optional — projects without a number are allowed."><input className="input" value={f.project_no} onChange={(e) => setF({ ...f, project_no: e.target.value })} /></Field>
        <Field label="Project name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="CDE"><input className="input" list="cdes" value={f.cde} onChange={(e) => setF({ ...f, cde: e.target.value })} /><datalist id="cdes"><option>ACC</option><option>Server</option></datalist></Field>
        <Field label="Type"><input className="input" list="types" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /><datalist id="types"><option>BIM</option><option>CAD</option></datalist></Field>
        <Field label="Built-up area"><input type="number" min={0} className="input" value={f.built_up_area} onChange={(e) => setF({ ...f, built_up_area: e.target.value })} /></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="BIM Manager"><select className="input" value={f.manager_id} onChange={(e) => setF({ ...f, manager_id: e.target.value })}><option value="">(unassigned)</option>{people('bim_manager').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="BIM Coordinator"><select className="input" value={f.coordinator_id} onChange={(e) => setF({ ...f, coordinator_id: e.target.value })}><option value="">(unassigned)</option>{[...people('bim_coordinator'), ...people('bim_manager')].map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
      </div></Modal>
  );
}

export default function ProjectsPage() { return <Suspense fallback={<p className="p-6 text-slate-500">Loading…</p>}><Inner /></Suspense>; }
