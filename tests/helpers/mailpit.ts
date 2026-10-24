/** Cliente mínimo da API HTTP do Mailpit (dev: http://127.0.0.1:8025). Só lê/apaga mensagens de teste. */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

export interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string; Name: string }[];
  From: { Address: string; Name: string };
  Attachments: number;
  Created: string;
}

export interface MailpitMessage extends MailpitSummary {
  Text: string;
  HTML: string;
  ReplyTo?: { Address: string }[];
  Attachments: any;
}

export async function mailpitUp(): Promise<boolean> {
  try {
    const r = await fetch(`${MAILPIT_URL}/api/v1/info`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${MAILPIT_URL}${path}`, init);
  if (!r.ok) throw new Error(`mailpit ${path} -> ${r.status}`);
  return (await r.json()) as T;
}

/** Mensagens enviadas para o endereço (busca `to:`). */
export async function messagesTo(address: string): Promise<MailpitSummary[]> {
  const r = await json<{ messages: MailpitSummary[] }>(`/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=50`);
  return r.messages ?? [];
}

export const getMessage = (id: string) => json<MailpitMessage>(`/api/v1/message/${id}`);

export async function getAttachment(id: string, partId: string): Promise<string> {
  const r = await fetch(`${MAILPIT_URL}/api/v1/message/${id}/part/${partId}`);
  if (!r.ok) throw new Error(`mailpit anexo -> ${r.status}`);
  return r.text();
}

/** Apaga só as mensagens do endereço (não esvazia a caixa inteira de quem usa o Mailpit). */
export async function deleteMessagesTo(address: string): Promise<void> {
  const ids = (await messagesTo(address)).map((m) => m.ID);
  if (ids.length) await json(`/api/v1/messages`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: ids }) });
}

/** Espera chegarem `n` mensagens para o endereço. */
export async function waitForMessages(address: string, n: number, timeoutMs = 30_000): Promise<MailpitSummary[]> {
  const end = Date.now() + timeoutMs;
  let got: MailpitSummary[] = [];
  while (Date.now() < end) {
    got = await messagesTo(address);
    if (got.length >= n) return got;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`esperava ${n} e-mail(s) para ${address} no Mailpit, chegaram ${got.length}: [${got.map((m) => m.Subject).join(" | ")}]`);
}
