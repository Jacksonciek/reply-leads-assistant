// Proactive message for a lead (first message, reminder, H-1), rendered from templates. Never uses the LLM.
import { EVENTS, type EventCode, type EventConfig } from '../../config/events';
import { resolveCase, type CaseResult } from './cases';
import { buildVars, render, renderTemplate, RenderError, type TemplateMap, type Vars } from './templates';
import { relativeDayWord } from './time';
import type { Lead } from './types';

export interface NextMessage {
  case: CaseResult;
  template_code: string | null;
  text: string | null;
  error: string | null;
  cross_event: EventCode | null;
  warnings: string[];
}

const FIRST_B = ['B1', 'B2', 'B3', 'B4', 'B5'];
const B_INTRO = 'Perkenalkan, saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview bersama Berjaya Properties.';

/** Another event's lead with the same phone that already received a message. */
export function crossEventOf(lead: Lead, all: Lead[]): Lead | undefined {
  if (!lead.phone_e164) return undefined;
  return all.find((o) => o.lead_id !== lead.lead_id && o.event !== lead.event && o.phone_e164 === lead.phone_e164 && !!o.first_sent_at);
}

/** Another event's lead with the same phone, contacted or not (for the "Terdaftar juga di" label). */
export function alsoRegisteredIn(lead: Lead, all: Lead[]): EventCode[] {
  if (!lead.phone_e164) return [];
  return [...new Set(all.filter((o) => o.lead_id !== lead.lead_id && o.event !== lead.event && o.phone_e164 === lead.phone_e164).map((o) => o.event))];
}

/** Jesselton first message for a number already contacted for the Roadshow (Roadshow's own variant was removed). */
export function renderCrossEvent(base: string, templates: TemplateMap, vars: Vars): string {
  const sentence = renderTemplate('CROSS_EVENT-B', templates, vars);
  if (!base.includes(B_INTRO)) throw new RenderError('Intro sentence not found for the CROSS_EVENT variant');
  return base.replace(B_INTRO, sentence);
}

export function nextMessage(
  lead: Lead, all: Lead[], templates: TemplateMap, now: Date, events: Record<EventCode, EventConfig> = EVENTS,
): NextMessage {
  const c = resolveCase(lead, now);
  const res: NextMessage = { case: c, template_code: c.template, text: null, error: null, cross_event: null, warnings: [] };
  if (lead.call_name_needs_review) res.warnings.push('Greeting name needs checking');
  if (lead.phone_invalid) res.warnings.push('Invalid WhatsApp number');
  const also = alsoRegisteredIn(lead, all);
  if (also.length) res.warnings.push(`Also registered for ${also.map((e) => events[e].display_name).join(', ')}`);
  if (!c.template) return res;
  try {
    const vars = buildVars(lead, events, now);
    let text = renderTemplate(c.template, templates, vars);
    const other = FIRST_B.includes(c.template) ? crossEventOf(lead, all) : undefined;
    if (other) {
      try {
        text = renderCrossEvent(text, templates, vars);
        res.cross_event = other.event;
      } catch (e) {
        res.warnings.push(`CROSS_EVENT variant not used: ${(e as Error).message}`);
      }
    }
    res.text = text;
  } catch (e) {
    res.error = (e as Error).message;
  }
  return res;
}

/** Render any template by code for the room's quick-insert buttons. */
export function renderForLead(
  code: string, lead: Lead, templates: TemplateMap, now: Date, events: Record<EventCode, EventConfig> = EVENTS,
): { text: string | null; error: string | null } {
  try {
    const vars = buildVars(lead, events, now, { waktu_obrolan: relativeDayWord(lead.last_inbound_at, now) });
    return { text: renderTemplate(code, templates, vars), error: null };
  } catch (e) {
    return { text: null, error: (e as Error).message };
  }
}

export interface InviteMessage { codes: [string, string]; parts: [string, string] | null; error: string | null }

/**
 * Jesselton "Sabtu ini" invitation, sent as message 1 → video → message 2.
 * Terkonfirmasi gets the fixed reminder (JC-FIX-*); Belum balas / Balas, belum pasti get the invitation (JC-INV-*).
 */
export function jesseltonInvite(
  lead: Lead, templates: TemplateMap, now: Date, events: Record<EventCode, EventConfig> = EVENTS,
): InviteMessage | null {
  if (lead.event !== 'JESSELTON') return null;
  const codes: [string, string] | null = lead.wa_status === 'CONFIRMED' ? ['JC-FIX-1', 'JC-FIX-2']
    : lead.wa_status === 'NO_REPLY' ? ['JC-INV-1', 'JC-INV-2'] : null;
  if (!codes) return null;
  try {
    const vars = buildVars(lead, events, now);
    return { codes, parts: [renderTemplate(codes[0], templates, vars), renderTemplate(codes[1], templates, vars)], error: null };
  } catch (e) {
    return { codes, parts: null, error: (e as Error).message };
  }
}

export { render };
