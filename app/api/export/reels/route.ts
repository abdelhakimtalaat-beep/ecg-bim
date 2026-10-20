import { z } from 'zod';
import { handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { loadDataset } from '@/lib/dataset';
import { addSheet, infoSheet, newBook, sendBook } from '@/lib/xlsx';
import { csvEscape } from '@/lib/importer';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const b = z.object({ ids: z.array(z.string().uuid()).optional(), format: z.enum(['xlsx', 'csv', 'ics']).default('xlsx') }).parse(await json(req));
    const ds = await loadDataset();
    const ids = b.ids ? new Set(b.ids) : null;
    const reels = ds.reels.filter((r) => !ids || ids.has(r.id));
    if (b.format === 'ics') {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ECG BIM Portal//BIM Reels//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Weekly BIM Reels'];
      for (const r of reels) {
        const d = r.session_date.replace(/-/g, '');
        const next = new Date(r.session_date + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
        lines.push('BEGIN:VEVENT', `UID:${r.id}@ecg-bim-portal`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`,
          `SUMMARY:${esc(`BIM Reel – ${r.presenter_name}${r.topic ? ': ' + r.topic : ''}`)}`,
          `DESCRIPTION:${esc([`Presenter: ${r.presenter_name}`, r.topic && `Topic: ${r.topic}`, `Status: ${r.status}`, r.link && `Link: ${r.link}`, r.notes && `Notes: ${r.notes}`].filter(Boolean).join('\n'))}`,
          `STATUS:${r.status === 'Cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT');
      }
      lines.push('END:VCALENDAR');
      return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="ecg-bim-reels.ics"' } });
    }
    const head = ['Employee ID', 'Employee Name', 'Weekday', 'Date', 'Topic', 'Status', 'Notes', 'Link'];
    const rows = reels.map((r) => [r.presenter_code, r.presenter_name, r.weekday, r.session_date, r.topic, r.status, r.notes, r.link]);
    if (b.format === 'csv') return new Response('\uFEFF' + [head, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ecg-bim-reels.csv"' } });
    const wb = newBook();
    addSheet(wb, 'BIM Reels', head, rows as any, [12, 26, 12, 12, 44, 14, 40, 40]);
    infoSheet(wb, 'Weekly BIM Reels Plan', [['Exported', new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'], ['Sessions', String(reels.length)]]);
    return sendBook(wb, 'ecg-bim-reels.xlsx');
  });
}
