'use client';
import { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Settings2 } from 'lucide-react';
import { useApp } from '@/components/store';
import { FilterBar, filtersToText } from '@/components/FilterBar';
import { ChartBox, Datum, HBar, StatusStack } from '@/components/charts';
import { Badge, Confirm, Empty, Field, Modal, PageHeader, StatusBadge, Tip, useToast } from '@/components/ui';
import { api, download, fmtNum } from '@/lib/client';
import { canEditProject } from '@/lib/can';
import { PersonStats, imbalanceOf, personStats, simulateReassign, hasArea } from '@/lib/metrics';
import { STATUSES, type Capacity, type Status } from '@/lib/types';

const heat = (v: number, max: number) => (max <= 0 || v <= 0 ? 'transparent' : `rgba(15,85,168,${0.12 + 0.78 * (v / max)})`);

export default function WorkloadPage() {
  const { me, data, projects, filters, emp, refresh } = useApp(); const toast = useToast();
  const cap = data.settings.capacity;
  const stats = useMemo(() => personStats(data, projects), [data, projects]);
  const [role, setRole] = useState<'manager' | 'coordinator'>('manager');
  const [cfg, setCfg] = useState(false);
  const mgrs = stats.filter((s) => s.role === 'manager'), coords = stats.filter((s) => s.role === 'coordinator');
  const list = role === 'manager' ? mgrs : coords;
  const hasCap = stats.some((s) => s.capacityPct != null);
  const ratio = cap.imbalance_ratio;
  const verdict = (s: PersonStats) => (s.capacityPct != null ? (s.capacityPct > 100 ? 'over' : s.capacityPct < 40 ? 'under' : 'ok') : ({ high: 'over', low: 'under', balanced: 'ok' } as const)[imbalanceOf(s, stats, ratio)]);
  const maxCol = (f: (s: PersonStats) => number) => Math.max(0, ...list.map(f));

  const exportXlsx = async () => { try { await download('/api/export/workload', { ids: projects.map((p) => p.id), filters: filtersToText(filters, emp) }, 'ecg-bim-workload.xlsx'); } catch (e: any) { toast(e.message, 'err'); } };
  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(15); doc.setTextColor(11, 37, 69); doc.text('BIM Team Workload Report', 36, 40);
    doc.setFontSize(8); doc.setTextColor(90);
    const capText = [cap.max_projects_per_manager && `max ${cap.max_projects_per_manager} active projects/manager`, cap.max_projects_per_coordinator && `max ${cap.max_projects_per_coordinator} active projects/coordinator`, cap.max_area_per_manager && `max area ${fmtNum(cap.max_area_per_manager)}/manager`, cap.max_area_per_coordinator && `max area ${fmtNum(cap.max_area_per_coordinator)}/coordinator`, cap.hours_per_project && cap.available_hours_per_person && `${cap.hours_per_project} h/project, ${cap.available_hours_per_person} h available`].filter(Boolean).join('; ') || 'NOT DEFINED — percentages are not shown, relative comparison only';
    doc.text([`Calculated: ${new Date().toLocaleString('en-GB')}   ·   Projects included: ${projects.length}`, `Filters: ${filtersToText(filters, emp)}`, `Counted as active: ${cap.count_statuses.join(', ')}   ·   Capacity definition: ${capText}`, 'Assumptions: project count and built-up area are proxies for workload, not measured effort; each project counts once per person; area uses valid numeric values only.'], 36, 54, { maxWidth: 770 });
    let y = 100;
    for (const [title, l] of [['BIM Managers', mgrs], ['BIM Coordinators', coords]] as const) {
      autoTable(doc, { startY: y, head: [[title, 'ID', 'Assigned', 'In Prog.', 'Not Started', 'On Hold', 'Closed', 'Active', 'Area (unique)', 'No area', 'Reports', 'Capacity', 'Relative']], styles: { fontSize: 7 }, headStyles: { fillColor: [15, 85, 168] },
        body: l.map((s) => [s.employee.name, s.employee.employee_code ?? '', s.projects, s.byStatus['In Progress'], s.byStatus['Not Started'], s.byStatus['On Hold'], s.byStatus.Closed, s.active, fmtNum(s.area), s.areaMissing, s.reports, s.capacityPct == null ? 'n/a' : s.capacityPct + '%', s.relative == null ? '' : s.relative.toFixed(2) + '×']) });
      y = (doc as any).lastAutoTable.finalY + 18;
    }
    doc.save('ecg-bim-workload.pdf');
  };

  // heatmap: managers (rows) × coordinators (cols) project counts
  const pairCols = coords.map((c) => c.employee);
  const pair = (m: string, c: string) => new Set(data.assignments.filter((a) => a.employee_id === m && a.role === 'manager' && projects.some((p) => p.id === a.project_id)).map((a) => a.project_id).filter((pid) => data.assignments.some((x) => x.project_id === pid && x.employee_id === c && x.role === 'coordinator'))).size;
  const pairMax = Math.max(0, ...mgrs.flatMap((m) => pairCols.map((c) => pair(m.employee.id, c.id))));

  const barData = (l: PersonStats[]): Datum[] => l.map((s) => ({ key: s.employee.id, name: s.employee.name, value: s.projects }));
  const stack = (l: PersonStats[]) => l.map((s) => ({ key: s.employee.id, name: s.employee.name, ...s.byStatus }));
  const high = stats.filter((s) => verdict(s) === 'over');

  return (
    <>
      <PageHeader title="BIM Team Workload" subtitle="Traceable calculations over unique projects. Project count and built-up area are proxies for workload, not measured effort."
        actions={<>{me.role === 'admin' && <button className="btn-secondary" onClick={() => setCfg(true)}><Settings2 size={16} />Capacity settings</button>}<button className="btn-secondary" onClick={exportXlsx}><FileSpreadsheet size={16} />Excel</button><button className="btn-secondary" onClick={exportPdf}><FileDown size={16} />PDF</button></>} />
      <FilterBar show={['q', 'manager', 'coordinator', 'status', 'cde', 'type', 'area']} />

      <div className={`mb-5 rounded-xl border p-4 text-sm ${hasCap ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {hasCap ? <><b>Capacity basis defined.</b> Percentages = active load ÷ configured maximum (highest of the defined measures). Counted as active: {cap.count_statuses.join(', ')}.</>
          : <><b>No capacity basis is defined yet</b>, so utilisation percentages are not shown. The tables below compare people <i>relatively</i> (index 1.0 = peer average; flagged above {ratio}× or below {(1 / ratio).toFixed(2)}×). {me.role === 'admin' ? 'Use “Capacity settings” to define limits.' : 'Ask the Department Manager to define capacity.'}</>}
      </div>

      <div className="mb-3 flex gap-1 border-b border-slate-200">{(['manager', 'coordinator'] as const).map((r) => <button key={r} onClick={() => setRole(r)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${role === r ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>{r === 'manager' ? 'BIM Managers' : 'BIM Coordinators'} ({(r === 'manager' ? mgrs : coords).length})</button>)}</div>
      {!list.length ? <Empty title="No assignments in the current selection" /> : (
        <div className="card mb-6 overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Name', 'Assigned', 'In Prog.', 'Not Started', 'On Hold', 'Closed', 'Active', 'Active assign.', 'Built-up area', 'Reports', 'Capacity / relative', 'Indicator'].map((h) => <th key={h} className="th">{h === 'Active' ? <Tip text={`Projects counted as active: ${cap.count_statuses.join(', ')}`}>{h}</Tip> : h === 'Active assign.' ? <Tip text="Assignments on projects that are not Closed">{h}</Tip> : h === 'Built-up area' ? <Tip text="Sum over unique assigned projects; only valid numeric areas. The count in brackets is projects without a valid area.">{h}</Tip> : h === 'Reports' ? <Tip text="Direct reports in the org chart">{h}</Tip> : h}</th>)}</tr></thead>
          <tbody>{list.map((s, i) => { const v = verdict(s); const mx = { a: maxCol((x) => x.projects), ip: maxCol((x) => x.byStatus['In Progress']), ns: maxCol((x) => x.byStatus['Not Started']), oh: maxCol((x) => x.byStatus['On Hold']), c: maxCol((x) => x.byStatus.Closed), ac: maxCol((x) => x.active), aa: maxCol((x) => x.activeAssignments), ar: maxCol((x) => x.area) };
            const cell = (val: number, m: number, txt?: string) => <td className="td text-center" style={{ background: heat(val, m), color: m > 0 && val / m > 0.55 ? '#fff' : undefined }}>{txt ?? val}</td>;
            return (<tr key={s.employee.id + s.role} className={`border-t border-slate-100 ${i % 2 ? 'bg-slate-50/60' : ''}`}>
              <td className="td"><b className="font-medium">{s.employee.name}</b><span className="block text-xs text-slate-500">{s.employee.employee_code ?? 'no ID'}</span></td>
              {cell(s.projects, mx.a)}{cell(s.byStatus['In Progress'], mx.ip)}{cell(s.byStatus['Not Started'], mx.ns)}{cell(s.byStatus['On Hold'], mx.oh)}{cell(s.byStatus.Closed, mx.c)}{cell(s.active, mx.ac)}{cell(s.activeAssignments, mx.aa)}
              {cell(s.area, mx.ar, `${fmtNum(s.area)}${s.areaMissing ? ` (${s.areaMissing})` : ''}`)}
              <td className="td text-center">{s.reports}</td>
              <td className="td">{s.capacityPct != null ? <span title={s.capacityBasis ?? ''} className={`font-semibold ${s.capacityPct > 100 ? 'text-red-600' : ''}`}>{s.capacityPct}%</span> : <span className="text-slate-600" title="Relative to the average of peers with the same role; not a utilisation percentage">{s.relative == null ? '—' : s.relative.toFixed(2) + '×'}</span>}</td>
              <td className="td">{v === 'over' ? <Badge tone={s.capacityPct != null && s.capacityPct > 100 ? 'red' : 'amber'}>{s.capacityPct != null ? 'overloaded' : 'above peers'}</Badge> : v === 'under' ? <Badge tone="blue">{s.capacityPct != null ? 'under-utilised' : 'below peers'}</Badge> : <Badge>in range</Badge>}</td></tr>); })}</tbody></table></div>)}

      {list.length > 0 && <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartBox title={`Assigned projects — ${role === 'manager' ? 'BIM Managers' : 'BIM Coordinators'}`} subtitle="Unique projects per person" height={Math.max(260, list.length * 32 + 70)}><HBar data={barData(list)} /></ChartBox>
        <ChartBox title="Status mix" subtitle="Where each person's projects stand" height={Math.max(260, list.length * 32 + 70)}><StatusStack data={stack(list)} /></ChartBox>
        <ChartBox title="Built-up area distribution" subtitle="Valid areas of unique projects (proxy only)" height={Math.max(260, list.length * 32 + 70)}><HBar data={list.map((s) => ({ key: s.employee.id, name: s.employee.name, value: Math.round(s.area) }))} color="#0F55A8" /></ChartBox>
        <div className="card overflow-auto p-4"><h3 className="text-sm font-semibold text-brand-900">Teams vs assigned projects</h3><p className="mb-2 text-xs text-slate-500">Number of projects each BIM Manager (row) shares with each BIM Coordinator (column)</p>
          <table className="text-xs"><thead><tr><th />{pairCols.map((c) => <th key={c.id} className="px-1 pb-1 align-bottom"><div className="h-24 w-6 origin-bottom-left -rotate-0 [writing-mode:vertical-rl] rotate-180 text-left font-medium text-slate-600">{c.name}</div></th>)}</tr></thead>
            <tbody>{mgrs.map((m) => <tr key={m.employee.id}><th className="whitespace-nowrap pr-3 text-left font-medium text-slate-700">{m.employee.name}</th>{pairCols.map((c) => { const n = pair(m.employee.id, c.id); return <td key={c.id} className="h-7 w-7 text-center" style={{ background: heat(n, pairMax), color: pairMax && n / pairMax > 0.55 ? '#fff' : '#334155' }}>{n || ''}</td>; })}</tr>)}</tbody></table></div>
      </div>}

      <Balancing high={high} stats={stats} />
      <Simulator stats={stats} onApplied={refresh} />
      {cfg && <CapacityModal cap={cap} onClose={() => setCfg(false)} onSaved={() => { setCfg(false); refresh(); }} />}
    </>
  );
}

function Balancing({ high, stats }: { high: PersonStats[]; stats: PersonStats[] }) {
  const { data, projects } = useApp();
  const topCount = [...stats].filter((s) => s.role === 'manager').sort((a, b) => b.load - a.load).slice(0, 2);
  const topArea = [...stats].filter((s) => s.role === 'manager').sort((a, b) => b.activeArea - a.activeArea).slice(0, 2);
  const cand = (s: PersonStats) => projects.filter((p) => p.status !== 'Closed' && data.assignments.some((a) => a.project_id === p.id && a.employee_id === s.employee.id && a.role === s.role)).sort((a, b) => (a.status === 'Not Started' ? -1 : 0) - (b.status === 'Not Started' ? -1 : 0) || (a.built_up_area ?? 0) - (b.built_up_area ?? 0)).slice(0, 4);
  return (
    <section className="card mb-6 p-4"><h3 className="text-sm font-semibold text-brand-900">Resource balancing</h3>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3 text-sm">
        <div><p className="label">Highest project counts</p>{topCount.map((s) => <p key={s.employee.id}>{s.employee.name} — {s.load} active</p>)}</div>
        <div><p className="label">Highest active built-up area</p>{topArea.map((s) => <p key={s.employee.id}>{s.employee.name} — {fmtNum(s.activeArea)}</p>)}</div>
        <div><p className="label">Flagged (above peers / over capacity)</p>{high.length ? high.map((s) => <p key={s.employee.id + s.role}>{s.employee.name} <span className="text-xs text-slate-500">({s.role})</span></p>) : <p className="text-slate-500">Nobody is flagged.</p>}</div>
      </div>
      {high.length > 0 && <div className="mt-4"><p className="label">Projects that could be considered for reassignment</p><p className="mb-2 text-xs text-slate-500">Suggestions only: open (not Closed) projects of flagged people, Not Started first, smaller areas first. Use the simulator below before changing anything.</p>
        {high.map((s) => <div key={s.employee.id + s.role} className="mb-1 text-sm"><b>{s.employee.name}:</b> {cand(s).map((p) => p.name).join(' · ') || '—'}</div>)}</div>}
    </section>
  );
}

function Simulator({ stats, onApplied }: { stats: PersonStats[]; onApplied: () => void }) {
  const { me, data, emp } = useApp(); const toast = useToast();
  const [role, setRole] = useState<'manager' | 'coordinator'>('coordinator'); const [pid, setPid] = useState(''); const [to, setTo] = useState(''); const [from, setFrom] = useState('');
  const [conf, setConf] = useState(false);
  const holders = pid ? data.assignments.filter((a) => a.project_id === pid && a.role === role) : [];
  const fromId = from || holders[0]?.employee_id || null;
  const eligible = data.employees.filter((e) => e.active && (role === 'manager' ? ['bim_manager', 'department_manager'].includes(e.job_category) : true) && e.id !== fromId);
  const sim = pid && to ? simulateReassign(data, pid, role, fromId, to) : null;
  const scope = pid ? canEditProject(me, data.assignments.filter((a) => a.project_id === pid && a.role === 'manager').map((a) => a.employee_id), []) : 'none';
  const allowed = role === 'manager' ? me.role === 'admin' : scope === 'full' || scope === 'manager';
  const Row = ({ label, s }: { label: string; s: PersonStats | null }) => <tr className="border-t"><td className="td">{label}</td><td className="td">{s?.projects ?? 0}</td><td className="td">{s?.active ?? 0}</td><td className="td">{fmtNum(s?.area ?? 0)}</td><td className="td">{s?.capacityPct != null ? s.capacityPct + '%' : s?.relative != null ? s.relative.toFixed(2) + '×' : '—'}</td></tr>;
  const name = (id: string | null) => (id ? emp.get(id)?.name : '(nobody)');
  return (
    <section className="card p-4"><h3 className="text-sm font-semibold text-brand-900">Reassignment simulator</h3>
      <p className="mb-3 text-xs text-slate-500">Compare workload before and after moving a project. <b>Nothing is saved</b> until you explicitly apply the change.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Role"><select className="input" value={role} onChange={(e) => { setRole(e.target.value as any); setPid(''); setFrom(''); setTo(''); }}><option value="coordinator">BIM Coordinator</option><option value="manager">BIM Manager</option></select></Field>
        <Field label="Project"><select className="input" value={pid} onChange={(e) => { setPid(e.target.value); setFrom(''); setTo(''); }}><option value="">Select…</option>{data.projects.filter((p) => p.status !== 'Closed').map((p) => <option key={p.id} value={p.id}>{p.project_no ? p.project_no + ' · ' : ''}{p.name}</option>)}</select></Field>
        <Field label="From">{holders.length > 1 ? <select className="input" value={fromId ?? ''} onChange={(e) => setFrom(e.target.value)}>{holders.map((h) => <option key={h.id} value={h.employee_id}>{name(h.employee_id)}</option>)}</select> : <input className="input" disabled value={pid ? name(fromId) : ''} />}</Field>
        <Field label="To"><select className="input" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Select…</option>{eligible.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
      </div>
      {sim && <div className="mt-4 overflow-x-auto"><table className="w-full max-w-2xl text-left"><thead><tr><th className="th" /> <th className="th">Assigned</th><th className="th">Active</th><th className="th">Area</th><th className="th">{stats.some((s) => s.capacityPct != null) ? 'Capacity' : 'Relative'}</th></tr></thead>
        <tbody><Row label={`${name(fromId)} — before`} s={sim.before.from} /><Row label={`${name(fromId)} — after`} s={sim.after.from} /><Row label={`${name(to)} — before`} s={sim.before.to} /><Row label={`${name(to)} — after`} s={sim.after.to} /></tbody></table>
        <div className="mt-3 flex items-center gap-3"><Badge tone="amber">Simulation only</Badge>{allowed ? <button className="btn-primary" onClick={() => setConf(true)}>Apply this reassignment…</button> : <span className="text-xs text-slate-500">You do not have permission to apply this change.</span>}</div></div>}
      <Confirm open={conf} onClose={() => setConf(false)} title="Apply reassignment" confirmLabel="Apply change" message={<>This will <b>permanently</b> change the {role} of <b>{data.projects.find((p) => p.id === pid)?.name}</b> from <b>{name(fromId)}</b> to <b>{name(to)}</b>. The change is recorded in the audit log under your name.</>}
        onConfirm={async () => { try { await api('/api/assignments/reassign', { body: { project_id: pid, role, from_employee_id: fromId, to_employee_id: to, confirm: true } }); toast('Reassigned'); setConf(false); setPid(''); setTo(''); onApplied(); } catch (e: any) { toast(e.message, 'err'); setConf(false); } }} />
    </section>
  );
}

function CapacityModal({ cap, onClose, onSaved }: { cap: Capacity; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const [f, setF] = useState<Capacity>({ ...cap });
  const n = (k: keyof Capacity, label: string, hint?: string) => <Field label={label} hint={hint}><input type="number" min={0} step="any" className="input" value={(f[k] as any) ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value === '' ? null : Number(e.target.value) })} /></Field>;
  return (
    <Modal open onClose={onClose} wide title="Capacity settings" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={async () => { try { await api('/api/settings', { method: 'PUT', body: { capacity: f } }); toast('Capacity settings saved'); onSaved(); } catch (e: any) { toast(e.message, 'err'); } }}>Save</button></>}>
      <p className="mb-4 text-sm text-slate-600">Leave a field empty if it is not an approved measure. A percentage is only shown when at least one limit below is defined; when several are defined the highest ratio is used.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {n('max_projects_per_manager', 'Max active projects per BIM Manager')}{n('max_projects_per_coordinator', 'Max active projects per BIM Coordinator')}
        {n('max_area_per_manager', 'Max active built-up area per BIM Manager', 'Area is a proxy, not effort.')}{n('max_area_per_coordinator', 'Max active built-up area per BIM Coordinator')}
        {n('hours_per_project', 'Estimated hours per active project (per period)')}{n('available_hours_per_person', 'Available hours per person (same period)')}
        <Field label="Imbalance ratio" hint="Used for relative flags: above ratio× or below 1/ratio× of the peer average."><input type="number" min={1.1} max={5} step={0.1} className="input" value={f.imbalance_ratio} onChange={(e) => setF({ ...f, imbalance_ratio: Number(e.target.value) })} /></Field>
        <Field label="Statuses counted as active workload"><div className="flex flex-wrap gap-3 pt-1">{STATUSES.map((s) => <label key={s} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.count_statuses.includes(s as Status)} onChange={() => setF({ ...f, count_statuses: f.count_statuses.includes(s as Status) ? f.count_statuses.filter((x) => x !== s) : [...f.count_statuses, s as Status] })} />{s}</label>)}</div></Field>
      </div>
    </Modal>
  );
}
