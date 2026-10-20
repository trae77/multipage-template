// Same LLM step as the n8n demo: OpenAI-compatible chat call, JSON {reply, questions}; any failure -> template.
export function templateReply(client, lead, slot) {
  const q = lead.trade === 'hvac'
    ? ['Is the system not heating, not cooling, or making noise?', 'About how old is the unit?']
    : ['What is going on (leak, clog, water heater, other)?', 'Is water actively leaking right now?'];
  const when = slot ? ` We have an opening ${slot}.` : '';
  return { reply: `Hi${lead.name ? ' ' + lead.name : ''}, thanks for contacting ${client.business_name}.${when} A couple quick questions:`, questions: q, source: 'template' };
}

export async function composeReply(env, client, lead, slot, fetchImpl = fetch) {
  if (!env.LLM_API_KEY || !env.LLM_BASE_URL) return templateReply(client, lead, slot);
  try {
    const sys = `You reply to service leads for ${client.business_name}. Services: ${client.services.join(', ')}. Hours: ${client.hours}. ` +
      'Reply in under 300 characters with 2-3 qualifying questions. Never quote prices, promise arrival times, or claim licenses. ' +
      'Return JSON {"reply": string, "questions": string[]}.';
    const res = await fetchImpl(`${env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.LLM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.LLM_MODEL || 'gpt-4o-mini', response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify({ lead, open_slot: slot }) }] }),
    });
    if (!res.ok) throw new Error('llm ' + res.status);
    const j = await res.json();
    const parsed = JSON.parse(j.choices[0].message.content);
    if (typeof parsed.reply !== 'string' || !Array.isArray(parsed.questions)) throw new Error('bad shape');
    return { reply: parsed.reply, questions: parsed.questions.slice(0, 3), source: 'llm' };
  } catch {
    return templateReply(client, lead, slot);
  }
}
