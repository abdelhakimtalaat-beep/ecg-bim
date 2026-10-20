'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export default function Login() {
  const r = useRouter(); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/auth/setup').then((s) => s.needsSetup && r.replace('/setup')).catch(() => {}); }, [r]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-4">
      <form className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await api('/api/auth/login', { body: { email, password: pw } }); r.push('/'); } catch (x: any) { setErr(x.message); setBusy(false); } }}>
        <img src="/api/logo" alt="ECG – Engineering Consultants Group, A Dorsch Global Company" className="mx-auto mb-6 h-16 object-contain" />
        <h1 className="text-center text-lg font-semibold text-brand-900">BIM Department Management Portal</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-500">Sign in to continue</p>
        <label className="label" htmlFor="email">Email</label><input id="email" type="email" required autoComplete="username" className="input mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label" htmlFor="pw">Password</label><input id="pw" type="password" required autoComplete="current-password" className="input mb-4" value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <p role="alert" className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
