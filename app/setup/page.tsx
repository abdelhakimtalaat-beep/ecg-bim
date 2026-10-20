'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export default function Setup() {
  const r = useRouter(); const [dm, setDm] = useState<string | null>(null); const [ready, setReady] = useState(false);
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { api('/api/auth/setup').then((s) => { if (!s.needsSetup) r.replace('/login'); else { setDm(s.departmentManager); setReady(true); } }).catch((e) => setErr(e.message)); }, [r]);
  if (!ready) return <div className="p-10 text-center text-slate-500">{err || 'Checking…'}</div>;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-4">
      <form className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl" onSubmit={async (e) => { e.preventDefault(); setErr(''); if (pw !== pw2) return setErr('Passwords do not match'); try { await api('/api/auth/setup', { body: { email, password: pw } }); r.push('/'); } catch (x: any) { setErr(x.message); } }}>
        <img src="/api/logo" alt="ECG" className="mx-auto mb-4 h-14 object-contain" />
        <h1 className="text-center text-lg font-semibold text-brand-900">First-time setup</h1>
        <p className="mb-5 mt-1 text-center text-sm text-slate-500">Create the administrator account{dm ? <> for <b>{dm}</b> (BIM Department Manager)</> : ''}. This page disappears once an account exists.</p>
        <label className="label" htmlFor="e">Email</label><input id="e" type="email" required className="input mb-3" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label" htmlFor="p">Password (min. 10 characters)</label><input id="p" type="password" required minLength={10} autoComplete="new-password" className="input mb-3" value={pw} onChange={(e) => setPw(e.target.value)} />
        <label className="label" htmlFor="p2">Repeat password</label><input id="p2" type="password" required minLength={10} autoComplete="new-password" className="input mb-4" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {err && <p role="alert" className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full">Create administrator</button>
      </form>
    </div>
  );
}
