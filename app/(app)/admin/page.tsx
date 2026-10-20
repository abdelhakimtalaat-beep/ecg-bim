'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '@/components/store';
import { ImportWizard } from '@/components/ImportWizard';
import { Badge, Field, Modal, PageHeader, Spinner, useToast } from '@/components/ui';
import { api, fmtDate, roleLabel } from '@/lib/client';
import { STATUSES, type Role } from '@/lib/types';

const TABS = [['users', 'Users & roles'], ['status', 'Status mapping'], ['quality', 'Data quality'], ['import', 'Import & history'], ['audit', 'Audit log'], ['brand', 'Branding & backup']] as const;

export default function AdminPage() {
  const { me } = useApp(); const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('users');
  useEffect(() => { if (me.role !== 'admin') router.replace('/'); }, [me, router]);
  if (me.role !== 'admin') return null;
  return (
    <>
      <PageHeader title="Administration" subtitle="Users, status mapping, data quality, imports and audit trail. Visible to the Department Manager / Administrator only." />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>)}</div>
      {tab === 'users' && <Users />}{tab === 'status' && <StatusMapping />}{tab === 'quality' && <Quality />}{tab === 'import' && <Imports />}{tab === 'audit' && <Audit />}{tab === 'brand' && <Brand />}
    </>
  );
}

function useLoad<T>(url: string) {
  const [d, setD] = useState<T | null>(null); const [err, setErr] = useState('');
  const load = useCallback(async () => { try { setD(await api<T>(url)); setErr(''); } catch (e: any) { setErr(e.message); } }, [url]);
  useEffect(() => { load(); }, [load]);
  return { d, err, load };
}

function Users() {
  const { data } = useApp(); const toast = useToast(); const { d, err, load } = useLoad<any[]>('/api/users'); const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ email: '', full_name: '', password: '', role: 'viewer' as Role, employee_id: '' });
  const patch = async (id: string, body: any) => { try { await api(`/api/users/${id}`, { method: 'PATCH', body }); toast('Updated'); load(); } catch (e: any) { toast(e.message, 'err'); } };
  if (err) return <p className="text-red-600">{err}</p>; if (!d) return <Spinner />;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><p className="text-sm text-slate-600">Roles are enforced on the server. BIM Managers and Coordinators see edit controls only for projects they are assigned to — link each user to their employee record so scope can be determined.</p><button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} />Add user</button></div>
      <div className="card overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Email', 'Name', 'Role', 'Linked employee', 'Active', 'Last sign-in', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{d.map((u) => (
        <tr key={u.id} className="border-t border-slate-100"><td className="td">{u.email}</td><td className="td">{u.full_name ?? '—'}</td>
          <td className="td"><select className="input w-56" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>{(['admin', 'bim_manager', 'bim_coordinator', 'viewer'] as Role[]).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></td>
          <td className="td"><select className="input w-48" value={u.employee_id ?? ''} onChange={(e) => patch(u.id, { employee_id: e.target.value || null })}><option value="">—</option>{data.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></td>
          <td className="td"><input type="checkbox" checked={u.active} onChange={(e) => patch(u.id, { active: e.target.checked })} aria-label={`Active: ${u.email}`} /></td><td className="td text-xs text-slate-500">{u.last_login_at ? fmtDate(u.last_login_at) : 'never'}</td>
          <td className="td"><button className="btn-secondary btn-sm" onClick={() => { const pw = prompt('New temporary password (min. 10 characters). The user must change it at next sign-in.'); if (pw) patch(u.id, { password: pw }); }}>Reset password</button></td></tr>))}</tbody></table></div>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add user" footer={<><button className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" onClick={async () => { try { await api('/api/users', { body: { ...f, employee_id: f.employee_id || null } }); toast('User created'); setAdding(false); setF({ email: '', full_name: '', password: '', role: 'viewer', employee_id: '' }); load(); } catch (e: any) { toast(e.message, 'err'); } }}>Create</button></>}>
        <div className="space-y-3"><Field label="Email"><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Temporary password" hint="At least 10 characters; the user is asked to change it."><input type="text" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{(['admin', 'bim_manager', 'bim_coordinator', 'viewer'] as Role[]).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></Field>
          <Field label="Linked employee"><select className="input" value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}><option value="">—</option>{data.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field></div></Modal>
    </div>
  );
}

function StatusMapping() {
  const { data, refresh } = useApp(); const toast = useToast();
  const [rows, setRows] = useState(data.mappings.map((m) => ({ source_status: m.source_status, activity_flag: m.activity_flag, target_status: m.target_status, note: m.note ?? '' })));
  const save = async (reapply: boolean) => { try { const r = await api('/api/status-mappings', { method: 'PUT', body: { mappings: rows.map((x) => ({ ...x, note: x.note || null })), reapply } }); toast(reapply ? `Saved. ${r.changed} project(s) re-mapped.` : 'Saved'); refresh(); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <div>
      <p className="mb-3 max-w-3xl text-sm text-slate-600">How original workbook values map to the four portal statuses. The workbook has a Status column (Open / Hold / Closed) and an unlabeled Active / Not Active column — a rule with a blank flag is the fallback for that status. Rules marked ASSUMPTION were set by the importer and need the department's approval. Projects whose status was changed manually are never overwritten.</p>
      <div className="card overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Workbook status', 'Activity flag', 'Portal status', 'Note', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => (
        <tr key={i} className="border-t border-slate-100">
          <td className="td"><input className="input w-36" value={r.source_status} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, source_status: e.target.value } : x)))} /></td>
          <td className="td"><select className="input w-36" value={r.activity_flag} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, activity_flag: e.target.value } : x)))}><option value="">(any / blank)</option><option>Active</option><option>Not Active</option></select></td>
          <td className="td"><select className="input w-36" value={r.target_status} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, target_status: e.target.value as any } : x)))}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
          <td className="td"><input className="input" value={r.note} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} /></td>
          <td className="td"><button className="btn-ghost btn-sm text-red-600" aria-label="Remove rule" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td></tr>))}</tbody></table></div>
      <div className="mt-3 flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setRows([...rows, { source_status: '', activity_flag: '', target_status: 'Not Started', note: '' }])}><Plus size={16} />Add rule</button><button className="btn-secondary" onClick={() => save(false)}>Save mapping</button><button className="btn-primary" onClick={() => confirm('Re-apply the mapping to every project whose status has not been changed manually?') && save(true)}>Save and re-apply to projects</button></div>
    </div>
  );
}

function Quality() {
  const toast = useToast(); const { d, err, load } = useLoad<any[]>('/api/issues'); const [sev, setSev] = useState('all'); const [showResolved, setShowResolved] = useState(false);
  if (err) return <p className="text-red-600">{err}</p>; if (!d) return <Spinner />;
  const rows = d.filter((i) => (sev === 'all' || i.severity === sev) && (showResolved || !i.resolved));
  const mark = async (ids: string[], resolved: boolean) => { try { await api('/api/issues', { method: 'PATCH', body: { ids, resolved } }); load(); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">Everything the importer cleaned, inferred, skipped or could not match. Nothing was changed silently. Resolve an item once it has been reviewed with the department.</p>
      <div className="mb-3 flex flex-wrap items-center gap-3"><select className="input w-40" value={sev} onChange={(e) => setSev(e.target.value)}><option value="all">All severities</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option></select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />Show resolved</label><span className="text-sm text-slate-500">{rows.length} item(s)</span></div>
      <div className="card overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Severity', 'Type', 'Where', 'Detail', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{rows.map((i) => (
        <tr key={i.id} className={`border-t border-slate-100 align-top ${i.resolved ? 'opacity-50' : ''}`}><td className="td"><Badge tone={i.severity === 'error' ? 'red' : i.severity === 'warning' ? 'amber' : 'gray'}>{i.severity}</Badge></td><td className="td text-xs">{i.kind}</td><td className="td text-xs">{i.entity}</td><td className="td text-sm">{i.message}</td>
          <td className="td"><button className="btn-secondary btn-sm" onClick={() => mark([i.id], !i.resolved)}>{i.resolved ? 'Re-open' : 'Resolve'}</button></td></tr>))}</tbody></table></div>
    </div>
  );
}

function Imports() {
  const { d, load } = useLoad<any[]>('/api/import/runs'); const [open, setOpen] = useState(false);
  return (
    <div><div className="mb-3 flex items-center justify-between"><p className="text-sm text-slate-600">Import projects from the department workbook or a CSV. Preview, column mapping, validation and duplicate detection happen before anything is saved; existing records are never overwritten.</p><button className="btn-primary" onClick={() => setOpen(true)}>New import</button></div>
      {!d ? <Spinner /> : <div className="card overflow-x-auto"><table className="w-full text-left"><thead><tr>{['When', 'Source', 'By', 'Result'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{d.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="td whitespace-nowrap">{fmtDate(r.at)}</td><td className="td">{r.source}</td><td className="td">{r.run_by}</td><td className="td text-xs">{Object.entries(r.summary || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td></tr>)}</tbody></table></div>}
      <ImportWizard open={open} onClose={() => { setOpen(false); load(); }} /></div>
  );
}

function Audit() {
  const { d, err } = useLoad<any[]>('/api/audit?limit=500'); const [term, setTerm] = useState('');
  if (err) return <p className="text-red-600">{err}</p>; if (!d) return <Spinner />;
  const rows = d.filter((r) => !term || JSON.stringify(r).toLowerCase().includes(term.toLowerCase()));
  return (
    <div><input className="input mb-3 max-w-sm" placeholder="Filter (user, action, project…)" value={term} onChange={(e) => setTerm(e.target.value)} />
      <div className="card overflow-x-auto"><table className="w-full text-left"><thead><tr>{['When', 'User', 'Action', 'Entity', 'Summary'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t border-slate-100 align-top"><td className="td whitespace-nowrap text-xs">{new Date(r.at).toLocaleString('en-GB')}</td><td className="td text-xs">{r.user_email ?? 'system'}</td><td className="td"><Badge>{r.action}</Badge></td><td className="td text-xs">{r.entity}</td><td className="td text-sm">{r.summary}</td></tr>)}</tbody></table></div>
      <p className="mt-2 text-xs text-slate-500">Showing the latest {rows.length} of up to 500 entries.</p></div>
  );
}

function Brand() {
  const toast = useToast(); const [v, setV] = useState(0);
  return (
    <div className="grid max-w-3xl gap-5">
      <section className="card p-5"><h3 className="mb-1 font-semibold text-brand-900">Organisation logo</h3><p className="mb-3 text-sm text-slate-600">The supplied ECG logo is used by default. If the department provides a higher-resolution official file, upload it here (PNG, JPEG or WebP, max 2 MB).</p>
        <div className="mb-3 inline-block rounded bg-white p-3 shadow-card"><img key={v} src={`/api/logo?v=${v}`} alt="Current logo" className="h-16 object-contain" /></div>
        <div className="flex flex-wrap gap-2"><label className="btn-secondary cursor-pointer">Upload logo<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await api('/api/logo', { raw: f, headers: { 'Content-Type': f.type } }); toast('Logo updated'); setV(v + 1); } catch (x: any) { toast(x.message, 'err'); } }} /></label>
          <button className="btn-ghost" onClick={async () => { try { await api('/api/logo', { method: 'DELETE' }); toast('Restored the supplied logo'); setV(v + 1); } catch (x: any) { toast(x.message, 'err'); } }}>Restore supplied logo</button></div></section>
      <section className="card p-5"><h3 className="mb-1 font-semibold text-brand-900">Backups</h3><p className="text-sm text-slate-600">All data lives in your Postgres database. On Supabase, enable daily backups (Project → Database → Backups; Point-in-time recovery on paid plans) and keep a periodic <code>pg_dump</code> copy. See <code>docs/SETUP.md</code> → “Backup and recovery”.</p></section>
    </div>
  );
}
