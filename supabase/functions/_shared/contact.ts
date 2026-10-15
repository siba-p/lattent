// Contact-form logic, independent of Deno so it can be unit-tested: validation, spam guards
// (a hidden honeypot field and a minimum time on the page) and a per-address rate limit.
export interface Enquiry { name: string; email: string; organisation: string; topic: string; message: string }
export interface ContactStore { recentCount(email: string, minutes: number): Promise<number>; save(e: Enquiry): Promise<number> }
export interface Mailer { send(subject: string, text: string, replyTo: string): Promise<boolean> }
const TOPICS = ['sales', 'lab', 'support', 'partnership', 'feedback', 'other'];
const LABEL: Record<string, string> = { sales: 'Buying Pro', lab: 'Lab plan or invoice', support: 'Help with Lattent', partnership: 'Partnership', feedback: 'Feedback', other: 'Other' };
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

export async function handleContact(body: any, store: ContactStore, mailer: Mailer): Promise<{ status: number; body: string }> {
  if (!body || typeof body !== 'object') return { status: 400, body: 'invalid request' };
  if (body.website) return { status: 200, body: 'ok' };                       // honeypot: bots fill hidden fields
  if (!(Number(body.elapsed) >= 3000)) return { status: 400, body: 'Please take a moment before sending.' };
  const e: Enquiry = {
    name: clean(body.name, 120), email: clean(body.email, 200).toLowerCase(), organisation: clean(body.organisation, 200),
    topic: TOPICS.includes(body.topic) ? body.topic : 'other', message: clean(body.message, 5000)
  };
  if (!e.name) return { status: 400, body: 'Please tell us your name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email)) return { status: 400, body: 'Please enter a valid email address.' };
  if (e.message.length < 10) return { status: 400, body: 'Please write a little more about what you need.' };
  if ((await store.recentCount(e.email, 60)) >= 3) return { status: 429, body: 'You have sent several messages in the last hour. We will reply soon.' };
  const id = await store.save(e);
  const text = `${LABEL[e.topic]} enquiry #${id}\n\nFrom: ${e.name} <${e.email}>${e.organisation ? '\nOrganisation: ' + e.organisation : ''}\n\n${e.message}\n`;
  await mailer.send(`[Lattent] ${LABEL[e.topic]}: ${e.name}`, text, e.email);
  return { status: 200, body: 'ok' };
}
