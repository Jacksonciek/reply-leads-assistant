import { useState } from 'react';
import * as XLSX from 'xlsx';
import { resolveCase } from '../../domain/cases';
import { parseSheetRows, type ParsedRow } from '../../domain/parse-excel-row';
import type { Lead } from '../../domain/types';
import { api } from '../api';
import { CaseChip, EventChip, STATE_EN, useToast } from '../shared';

interface Row extends ParsedRow { dup: boolean; case: string }

export function ImportPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mode, setMode] = useState<'skip' | 'update'>('skip');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const onFile = async (file: File) => {
    setResult('');
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const read = (name: string) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '', raw: false }) : []);
      const parsed = [...parseSheetRows('Roadshow', read('Roadshow')), ...parseSheetRows('Jesselton', read('Jesselton'))];
      if (!parsed.length) { toast('No "Roadshow" or "Jesselton" sheet with data', 'err'); return; }
      const { leads } = await api<{ leads: Lead[] }>('/api/leads');
      const have = new Set(leads.map((l) => `${l.event}:${l.phone_e164}`));
      const now = new Date();
      setRows(parsed.map((p) => ({ ...p, dup: have.has(`${p.lead.event}:${p.lead.phone_e164}`), case: resolveCase(p.lead, now).code })));
    } catch (e) { toast(`Could not read file: ${(e as Error).message}`, 'err'); }
  };

  const commit = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const r = await api<{ created: number; updated: number; skipped: number }>('/api/import/commit', { body: { mode, leads: rows.map((x) => x.lead) } });
      setResult(`Done: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped.`);
      setRows(null);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Import Excel</h1>
      <div className="card">
        <p className="mb-2 text-sm text-ink-2">Upload an .xlsx file with a <b>Roadshow</b> and/or <b>Jesselton</b> sheet (same format as the original file). The file is read in your browser; data is only sent after you confirm.</p>
        <input type="file" accept=".xlsx" className="input" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>
      {result && <p className="card text-sm text-emerald-800">{result}</p>}
      {rows && (
        <>
          <div className="card flex flex-wrap items-center gap-3 text-sm">
            <span>{rows.length} rows · {rows.filter((r) => r.dup).length} duplicates · {rows.filter((r) => r.warnings.length).length} with warnings</span>
            <select className="input max-w-56" value={mode} onChange={(e) => setMode(e.target.value as 'skip' | 'update')}>
              <option value="skip">Skip duplicates</option><option value="update">Update duplicates</option>
            </select>
            <button className="btn-primary" disabled={busy} onClick={commit}>Save to Google Sheets</button>
          </div>
          <ul className="card divide-y divide-line p-0">
            {rows.map((r, i) => (
              <li key={i} className="space-y-1 px-4 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <EventChip event={r.lead.event} />
                  <span className="font-medium">{r.lead.full_name}</span>
                  <CaseChip code={r.case} />
                  <span className="text-xs text-ink-3">{STATE_EN[r.lead.state]}</span>
                  {r.dup && <span className="chip bg-amber-100 text-amber-800">Duplicate</span>}
                </div>
                <div className="text-xs text-ink-2">Greeting: {r.lead.gender || 'Bapak/Ibu'} {r.lead.call_name}{r.lead.agent_name && ` · agent ${r.lead.agent_name}`} · {r.lead.phone_invalid ? 'invalid number' : r.lead.phone_e164}</div>
                {r.warnings.map((w) => <div key={w} className="text-xs text-amber-800">⚠ {w}</div>)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
