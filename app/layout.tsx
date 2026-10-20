import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'ECG BIM Department Management Portal', description: 'Projects, teams, workload and training for the ECG BIM Management Department', icons: { icon: '/ecg-logo.png' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0F55A8' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
