// Event knowledge base. Only facts from the posters / Jackson. No product specs, prices or unit data.
// Values marked "overridable" can be replaced from the `Config` sheet (key `event.<CODE>.<field>`).

export type EventCode = 'ROADSHOW' | 'JESSELTON';
export type SessionCode = 'S1' | 'S2';

export interface SessionInfo {
  code: SessionCode;
  label: string; // 11.00–13.00
  name: string;
  excelValue: string; // 11:00-13:00
}

export interface EventConfig {
  code: EventCode;
  team_name: string; // overridable: "tim {team_name}"
  display_name: string; // overridable
  short_name: string; // overridable
  sheet_tab: string; // Google Sheets tab holding this event's leads
  aliases: string[];
  year: number;
  start_date: string; // YYYY-MM-DD (WIB)
  end_date: string;
  venue: string;
  venue_detail: string;
  opening_hours: string | null; // overridable; null = never mention hours
  poster_path: string;
  project_link: string | null;
  organizer: string | null;
  sessions: SessionInfo[];
  facts: string[]; // extra facts for the LLM knowledge base
}

export const EVENTS: Record<EventCode, EventConfig> = {
  ROADSHOW: {
    code: 'ROADSHOW',
    team_name: 'Pameran Properti Malaysia',
    display_name: 'Medan Property Roadshow',
    short_name: 'pameran',
    sheet_tab: 'Roadshow',
    aliases: ['Malaysia Property Roadshow', 'Malaysia Property Showcase', 'KL Property Roadshow Medan'],
    year: 2026,
    start_date: '2026-11-23',
    end_date: '2026-11-29',
    venue: 'Cambridge City Square, Medan',
    venue_detail: 'Lantai G, depan Lebanon',
    opening_hours: null,
    poster_path: '/einvite/roadshow.jpeg',
    project_link: null,
    organizer: null,
    sessions: [],
    facts: [
      'Acara berlangsung Senin–Minggu, 23–29 November 2026. Klien memilih satu hari kunjungan.',
      'Lokasi: Cambridge City Square, Medan, Lantai G, depan Lebanon.',
      'Booth: area Concourse, Ground Floor, dekat Restoran Lebanon, Cambridge City Square.',
      'Nama tim di poster: Pameran Properti Malaysia.',
      'Poster: "Undangan Khusus", "Temukan Pilihan Properti di Malaysia".',
      'Lokasi properti yang ditampilkan: Penang, Kuala Lumpur, Port Dickson.',
      'Proyek yang ditampilkan (nama saja): Jesselton Courtyard, Royal Lexis, 10 Stonor, Pavilion Square, Katana II, Berjaya Times Square 2, Lexis Hibiscus.',
      'Tersedia Konsultasi Privat dengan tim Property Advisor di acara.',
    ],
  },
  JESSELTON: {
    code: 'JESSELTON',
    team_name: 'penyelenggara Jesselton Courtyard Private Property Preview',
    sheet_tab: 'Jesselton',
    display_name: 'Jesselton Courtyard Private Property Preview',
    short_name: 'Private Property Preview',
    aliases: ['Jesselton Courtyard', 'Private Invitation'],
    year: 2026,
    start_date: '2026-11-28',
    end_date: '2026-11-28',
    venue: 'Cambridge Hotel Medan',
    venue_detail: 'Emerald 1, Lantai 25',
    opening_hours: null,
    poster_path: '/einvite/jesselton.jpeg',
    project_link: 'https://jesselton-medan.pages.dev/',
    organizer: 'Berjaya Properties × Zeon Properties International',
    sessions: [
      { code: 'S1', label: '11.00–13.00', name: 'Private Talk & Luncheon', excelValue: '11:00-13:00' },
      { code: 'S2', label: '15.00–17.00', name: 'Private Preview & Afternoon Tea', excelValue: '15:00-17:00' },
    ],
    facts: [
      'Tanggal: Sabtu, 28 November 2026.',
      'Lokasi: Cambridge Hotel Medan, Emerald 1, Lantai 25.',
      'Sesi 1: 11.00–13.00 WIB, Private Talk & Luncheon.',
      'Sesi 2: 15.00–17.00 WIB, Private Preview & Afternoon Tea.',
      'Kehadiran terbatas, RSVP untuk konfirmasi kehadiran.',
      'Proyek: Jesselton Courtyard, Penang, Malaysia ("Alamat Istimewa. Rumah untuk Generasi.").',
      'Penyelenggara: Berjaya Properties × Zeon Properties International.',
      'Informasi proyek: https://jesselton-medan.pages.dev/',
    ],
  },
};

/** Apply overrides from the Config sheet (key `event.<CODE>.<field>`). */
export function resolveEvents(config: Record<string, string>): Record<EventCode, EventConfig> {
  const out = structuredClone(EVENTS);
  for (const code of Object.keys(out) as EventCode[]) {
    const ev = out[code];
    const get = (f: string) => config[`event.${code}.${f}`];
    if (get('team_name')) ev.team_name = get('team_name')!;
    if (get('display_name')) ev.display_name = get('display_name')!;
    if (get('short_name')) ev.short_name = get('short_name')!;
    const oh = get('opening_hours');
    if (oh !== undefined) ev.opening_hours = oh.trim() === '' ? null : oh.trim();
  }
  return out;
}

export function sessionInfo(code: string | null | undefined): SessionInfo | undefined {
  return EVENTS.JESSELTON.sessions.find((s) => s.code === code);
}

export const EVENT_CODES = Object.keys(EVENTS) as EventCode[];
