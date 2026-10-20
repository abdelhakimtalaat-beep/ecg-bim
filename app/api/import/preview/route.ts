import ExcelJS from 'exceljs';
import { handle, ok } from '@/lib/api';
import { ApiError, requireUser } from '@/lib/auth';
import { autoMap, csvToRows } from '@/lib/importer';

function cellValue(v: any): string | number | null {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);                // formula -> cached result
    if ('richText' in v) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return null;
  }
  return String(v);
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser(['admin']);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'Choose a file to import');
    if (file.size > 4 * 1024 * 1024) throw new ApiError(400, 'File must be 4 MB or smaller');
    const name = file.name;
    const sheets: { name: string; headers: (string | number | null)[]; rows: (string | number | null)[][]; mapping: ReturnType<typeof autoMap> }[] = [];
    if (/\.csv$/i.test(name)) {
      const all = csvToRows(await file.text());
      if (all.length < 2) throw new ApiError(400, 'The CSV file has no data rows');
      sheets.push({ name: 'CSV', headers: all[0], rows: all.slice(1, 3001) as any, mapping: autoMap(all[0]) });
    } else if (/\.xlsx$/i.test(name)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
      wb.eachSheet((ws) => {
        const rows: (string | number | null)[][] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          const arr: (string | number | null)[] = [];
          for (let c = 1; c <= Math.min(ws.columnCount, 40); c++) arr.push(cellValue(row.getCell(c).value));
          rows.push(arr);
        });
        if (rows.length < 2) return;
        sheets.push({ name: ws.name, headers: rows[0], rows: rows.slice(1, 3001), mapping: autoMap(rows[0]) });
      });
      if (!sheets.length) throw new ApiError(400, 'No sheet with data was found');
    } else throw new ApiError(400, 'Only .xlsx and .csv files can be imported');
    return ok({ filename: name, sheets });
  });
}
