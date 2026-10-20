'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Maximize2, Minus, Plus, Search, UserPlus, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useApp } from '@/components/store';
import { Badge, Confirm, Drawer, Empty, Field, Modal, PageHeader, StatusBadge, useToast } from '@/components/ui';
import { api, saveBlob } from '@/lib/client';
import { chainToRoot } from '@/lib/metrics';
import { CARD_H, CARD_W, descendants, layoutTree } from '@/lib/orgLayout';
import type { Employee } from '@/lib/types';
import { isAdmin } from '@/lib/can';

const CAT_STYLE: Record<string, string> = {
  department_manager: 'bg-brand-900 text-white border-brand-900',
  bim_manager: 'bg-brand-600 text-white border-brand-700',
  bim_coordinator: 'bg-brand-100 text-brand-900 border-brand-300',
  bim_specialist: 'bg-white text-brand-900 border-brand-400',
  rd_engineer: 'bg-white text-brand-900 border-brand-400 border-dashed',
  other: 'bg-slate-100 text-slate-800 border-slate-300',
};
const CAT_LABEL: Record<string, string> = { department_manager: 'Department Manager', bim_manager: 'BIM Manager', bim_coordinator: 'BIM Coordinator', bim_specialist: 'BIM Specialist', rd_engineer: 'R&D BIM Engineer', other: 'Other' };
const PAD = 40;

export default function OrgPage() {
  const { me, data, refresh, emp } = useApp(); const toast = useToast();
  const admin = isAdmin(me);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [view, setView] = useState({ x: 20, y: 20, k: 0.8 });
  const [editing, setEditing] = useState<Partial<Employee> & { _new?: boolean } | null>(null);
  const [confirmDeact, setConfirmDeact] = useState<Employee | null>(null);
  const vp = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const layout = useMemo(() => layoutTree(data.employees.map((e) => ({ id: e.id, reports_to: e.reports_to })), collapsed), [data.employees, collapsed]);
  const chain = useMemo(() => new Set(sel ? chainToRoot(data.employees, sel) : []), [sel, data.employees]);
  const W = layout.width + PAD * 2, H = layout.height + PAD * 2;

  const fit = useCallback(() => {
    const el = vp.current; if (!el || !W) return;
    const k = Math.min(1.2, Math.max(0.15, Math.min(el.clientWidth / W, el.clientHeight / H)));
    setView({ k, x: (el.clientWidth - W * k) / 2, y: 12 });
  }, [W, H]);
  useEffect(() => { fit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // wheel zoom around the cursor (non-passive so the page does not scroll)
    const el = vp.current; if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView((v) => { const k = Math.min(2.5, Math.max(0.15, v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }; });
    };
    el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h);
  }, []);
  const zoom = (f: number) => { const el = vp.current!; const mx = el.clientWidth / 2, my = el.clientHeight / 2; setView((v) => { const k = Math.min(2.5, Math.max(0.15, v.k * f)); return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }; }); };

  const results = useMemo(() => {
    const t = term.trim().toLowerCase(); if (!t) return [];
    return data.employees.filter((e) => [e.name, e.employee_code, e.job_title, e.discipline, CAT_LABEL[e.job_category]].some((s) => (s || '').toLowerCase().includes(t))).slice(0, 8);
  }, [term, data.employees]);
  const focus = (id: string) => {
    setSel(id); setTerm('');
    const anc = chainToRoot(data.employees, id).slice(1); // expand collapsed ancestors
    setCollapsed((c) => { const n = new Set(c); anc.forEach((a) => n.delete(a)); return n; });
    setTimeout(() => { const p = layoutTree(data.employees.map((e) => ({ id: e.id, reports_to: e.reports_to })), new Set([...collapsed].filter((c) => !anc.includes(c)))).placed.get(id); const el = vp.current;
      if (p && el) setView((v) => ({ ...v, x: el.clientWidth / 2 - (p.x + PAD + CARD_W / 2) * v.k, y: el.clientHeight / 3 - (p.y + PAD) * v.k })); }, 0);
  };
  const toggle = (id: string) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const collapseAll = () => setCollapsed(new Set(data.employees.filter((e) => data.employees.some((x) => x.reports_to === e.id) && e.job_category !== 'department_manager').map((e) => e.id)));

  const exportImg = async (kind: 'png' | 'pdf') => {
    const node = content.current; if (!node) return;
    try {
      const { toPng } = await import('html-to-image');
      const png = await toPng(node, { pixelRatio: 2.5, backgroundColor: '#ffffff', width: W, height: H, style: { transform: 'none', left: '0', top: '0' } });
      if (kind === 'png') { const b = await (await fetch(png)).blob(); saveBlob(b, 'ecg-bim-organization-chart.png'); return; }
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: W >= H ? 'landscape' : 'portrait', unit: 'pt', format: 'a3' });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(14); pdf.setTextColor(11, 37, 69); pdf.text('ECG BIM Department — Organization Chart', 30, 28);
      pdf.setFontSize(8); pdf.setTextColor(100); pdf.text(`Generated ${new Date().toLocaleString('en-GB')}`, 30, 40);
      const s = Math.min((pw - 60) / W, (ph - 70) / H);
      pdf.addImage(png, 'PNG', (pw - W * s) / 2, 52, W * s, H * s);
      pdf.save('ecg-bim-organization-chart.pdf');
    } catch (e: any) { toast('Export failed: ' + e.message, 'err'); }
  };

  const detail = open ? emp.get(open) : null;
  const projectsOf = (id: string) => data.assignments.filter((a) => a.employee_id === id).map((a) => ({ a, p: data.projects.find((p) => p.id === a.project_id)! })).filter((x) => x.p);
  const reports = (id: string) => data.employees.filter((e) => e.reports_to === id);

  return (
    <>
      <PageHeader title="Department Organization Chart" subtitle="Generated from employee and reporting-relationship data. Drag to pan, scroll to zoom, click a card for details."
        actions={<>{admin && <button className="btn-primary" onClick={() => setEditing({ _new: true, job_category: 'bim_coordinator', reports_to: data.employees.find((e) => e.job_category === 'department_manager')?.id ?? null })}><UserPlus size={16} />Add employee</button>}
          <button className="btn-secondary" onClick={() => exportImg('png')}><Download size={16} />PNG</button><button className="btn-secondary" onClick={() => exportImg('pdf')}><Download size={16} />PDF</button></>} />
      <div className="card no-print mb-3 flex flex-wrap items-center gap-2 p-3">
        <div className="relative w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Find by name, ID, role or discipline" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search employees" />
          {results.length > 0 && <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">{results.map((e) => <li key={e.id}><button className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => focus(e.id)}><span>{e.name}</span><span className="text-xs text-slate-500">{e.employee_code ?? ''} · {e.job_title}</span></button></li>)}</ul>}
        </div>
        <button className="btn-secondary btn-sm" onClick={() => zoom(1.2)} aria-label="Zoom in"><Plus size={14} /></button>
        <button className="btn-secondary btn-sm" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out"><Minus size={14} /></button>
        <button className="btn-secondary btn-sm" onClick={fit}><Maximize2 size={14} />Fit to screen</button>
        <button className="btn-secondary btn-sm" onClick={() => setCollapsed(new Set())}><ChevronsUpDown size={14} />Expand all</button>
        <button className="btn-secondary btn-sm" onClick={collapseAll}><ChevronsDownUp size={14} />Collapse teams</button>
        <div className="ml-auto flex flex-wrap gap-1.5 text-xs">{Object.entries(CAT_LABEL).filter(([k]) => k !== 'other').map(([k, v]) => <span key={k} className={`rounded border px-2 py-0.5 ${CAT_STYLE[k]}`}>{v}</span>)}</div>
      </div>

      {!data.employees.length ? <Empty title="No employees yet" hint="Add the first employee or run the seed script." /> : (
        <div ref={vp} className="card relative h-[68vh] min-h-[420px] cursor-grab touch-none overflow-hidden bg-[radial-gradient(#DCEAFA_1px,transparent_1px)] [background-size:18px_18px] active:cursor-grabbing"
          onPointerDown={(e) => { if ((e.target as HTMLElement).closest('[data-card]')) return; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { const d = drag.current; if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y })); }}
          onPointerUp={() => { drag.current = null; }}>
          <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0 }}>
            <div ref={content} style={{ position: 'relative', width: W, height: H, background: 'transparent' }}>
              <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden>
                {[...layout.placed.values()].flatMap((p) => p.children.map((cid) => {
                  const c = layout.placed.get(cid)!; const x1 = p.x + PAD + CARD_W / 2, y1 = p.y + PAD + CARD_H, x2 = c.x + PAD + CARD_W / 2, y2 = c.y + PAD, my = (y1 + y2) / 2;
                  const hi = chain.has(cid) && chain.has(p.id);
                  return <path key={p.id + cid} d={`M${x1},${y1} V${my} H${x2} V${y2}`} fill="none" stroke={hi ? '#E8A317' : '#8DB9EA'} strokeWidth={hi ? 3 : 1.6} />;
                }))}
              </svg>
              {[...layout.placed.values()].map((p) => {
                const e = emp.get(p.id)!; const nKids = data.employees.filter((x) => x.reports_to === e.id).length; const isCol = collapsed.has(e.id);
                return (
                  <div key={e.id} data-card style={{ position: 'absolute', left: p.x + PAD, top: p.y + PAD, width: CARD_W, height: CARD_H }}>
                    <button onClick={() => { setSel(e.id); setOpen(e.id); }} className={`h-full w-full rounded-xl border-2 p-3 text-left shadow-card transition hover:shadow-lg ${CAT_STYLE[e.job_category]} ${!e.active ? 'opacity-50' : ''} ${sel === e.id ? 'ring-4 ring-amber-400' : chain.has(e.id) ? 'ring-2 ring-amber-300' : ''}`}>
                      <span className="block truncate text-sm font-semibold leading-tight">{e.name}</span>
                      <span className="mt-0.5 block text-xs font-medium opacity-90">{e.employee_code ? `ID ${e.employee_code}` : 'ID not supplied'}</span>
                      <span className="mt-1 block truncate text-xs opacity-90">{e.job_title}{e.team_location ? ` (${e.team_location})` : ''}</span>
                      <span className="block truncate text-xs opacity-80">{[e.discipline, e.year_value].filter(Boolean).join(' · ')}{!e.active ? ' · inactive' : ''}</span>
                    </button>
                    {nKids > 0 && <button onClick={() => toggle(e.id)} aria-label={isCol ? 'Expand branch' : 'Collapse branch'} className="absolute -bottom-3 left-1/2 flex h-6 -translate-x-1/2 items-center gap-0.5 rounded-full border border-brand-300 bg-white px-1.5 text-xs text-brand-700 shadow hover:bg-brand-50">{isCol ? <ChevronRight size={12} /> : <ChevronDown size={12} />}{nKids}</button>}
                  </div>);
              })}
            </div>
          </div>
        </div>)}

      <Drawer open={!!detail} onClose={() => setOpen(null)} title={detail?.name ?? ''}>
        {detail && <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[['Employee ID', detail.employee_code ?? 'Not supplied'], ['Role', detail.job_title], ['Category', CAT_LABEL[detail.job_category]], ['Discipline', detail.discipline ?? '—'], ['Year (as supplied)', detail.year_value ?? '—'], ['Team location', detail.team_location ?? '—'],
              ['Reports to', detail.reports_to ? emp.get(detail.reports_to)?.name : '—'], ['Status', detail.active ? 'Active' : 'Inactive']].map(([k, v]) => <div key={String(k)}><p className="label">{k}</p><p>{v}</p></div>)}
          </div>
          {detail.notes && <p className="rounded bg-slate-50 p-3 text-sm">{detail.notes}</p>}
          {admin && <div className="flex flex-wrap gap-2"><button className="btn-secondary btn-sm" onClick={() => setEditing({ ...detail })}>Edit / transfer</button>
            <button className="btn-secondary btn-sm" onClick={() => setEditing({ _new: true, job_category: 'bim_coordinator', reports_to: detail.id })}>Add direct report</button>
            <button className="btn-secondary btn-sm" onClick={() => (detail.active ? setConfirmDeact(detail) : api(`/api/employees/${detail.id}`, { method: 'PATCH', body: { active: true } }).then(refresh))}>{detail.active ? 'Deactivate' : 'Reactivate'}</button></div>}
          <div><p className="label">Direct reports ({reports(detail.id).length})</p>{reports(detail.id).length ? <ul className="space-y-1">{reports(detail.id).map((r) => <li key={r.id}><button className="text-sm text-brand-700 hover:underline" onClick={() => { setOpen(r.id); setSel(r.id); }}>{r.name}</button> <span className="text-xs text-slate-500">{r.job_title}</span></li>)}</ul> : <p className="text-sm text-slate-500">None</p>}</div>
          <div><p className="label">Assigned projects ({projectsOf(detail.id).length})</p>
            {projectsOf(detail.id).length ? <ul className="max-h-80 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">{projectsOf(detail.id).map(({ a, p }) => <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm"><span className="min-w-0"><span className="block truncate">{p.project_no ? `${p.project_no} · ` : ''}{p.name}</span><span className="text-xs text-slate-500">{a.role}</span></span><StatusBadge status={p.status} /></li>)}</ul>
              : <p className="text-sm text-slate-500">No project assignments in the data.</p>}
            <Link href="/teams" className="mt-2 inline-block text-xs text-brand-600 hover:underline">Open Teams & Assignments →</Link></div>
        </div>}
      </Drawer>

      <Confirm open={!!confirmDeact} onClose={() => setConfirmDeact(null)} danger title="Deactivate employee" confirmLabel="Deactivate"
        message={<>Deactivate <b>{confirmDeact?.name}</b>? They stay in the chart (greyed out) and keep their history. {confirmDeact && data.assignments.some((a) => a.employee_id === confirmDeact.id) ? 'They still have project assignments — reassign those on the Teams page.' : ''}</>}
        onConfirm={async () => { try { await api(`/api/employees/${confirmDeact!.id}`, { method: 'PATCH', body: { active: false } }); toast('Deactivated'); setConfirmDeact(null); refresh(); } catch (e: any) { toast(e.message, 'err'); } }} />
      {editing && <EmployeeForm init={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </>
  );
}

function EmployeeForm({ init, onClose, onSaved }: { init: Partial<Employee> & { _new?: boolean }; onClose: () => void; onSaved: () => void }) {
  const { data } = useApp(); const toast = useToast();
  const [f, setF] = useState({ employee_code: init.employee_code ?? '', name: init.name ?? '', job_title: init.job_title ?? '', job_category: init.job_category ?? 'bim_coordinator', discipline: init.discipline ?? '', year_value: init.year_value ?? ('' as any), team_location: init.team_location ?? '', notes: init.notes ?? '', reports_to: init.reports_to ?? '' });
  const [busy, setBusy] = useState(false);
  const titles = [...new Set(data.employees.map((e) => e.job_title))];
  const blockedIds = init.id ? new Set([init.id, ...descendants(layoutTree(data.employees.map((e) => ({ id: e.id, reports_to: e.reports_to })), new Set()).kids, init.id)]) : new Set<string>();
  const save = async () => {
    setBusy(true);
    try {
      const body: any = { employee_code: f.employee_code || null, name: f.name, job_title: f.job_title, job_category: f.job_category, discipline: f.discipline || null, year_value: f.year_value === '' ? null : Number(f.year_value), team_location: f.team_location || null, notes: f.notes || null, reports_to: f.reports_to || null };
      if (init._new) await api('/api/employees', { body }); else await api(`/api/employees/${init.id}`, { method: 'PATCH', body });
      toast(init._new ? 'Employee added' : 'Saved'); onSaved();
    } catch (e: any) { toast(e.message, 'err'); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} wide title={init._new ? 'Add employee' : `Edit ${init.name}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.name || !f.job_title} onClick={save}>Save</button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Employee ID" hint="Leave blank if not supplied."><input className="input" value={f.employee_code} onChange={(e) => setF({ ...f, employee_code: e.target.value })} /></Field>
        <Field label="Job title"><input list="titles" className="input" value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /><datalist id="titles">{titles.map((t) => <option key={t} value={t} />)}</datalist></Field>
        <Field label="Category"><select className="input" value={f.job_category} onChange={(e) => setF({ ...f, job_category: e.target.value as any })}>{Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Discipline"><input className="input" value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value })} /></Field>
        <Field label="Year (as shown on the chart)"><input type="number" className="input" value={f.year_value} onChange={(e) => setF({ ...f, year_value: e.target.value as any })} /></Field>
        <Field label="Team location"><input className="input" placeholder="NC / SV / Alex" value={f.team_location} onChange={(e) => setF({ ...f, team_location: e.target.value })} /></Field>
        <Field label="Reports to"><select className="input" value={f.reports_to} onChange={(e) => setF({ ...f, reports_to: e.target.value })}><option value="">(nobody — top of chart)</option>{data.employees.filter((e) => !blockedIds.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name} — {e.job_title}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
      </div>
    </Modal>
  );
}
