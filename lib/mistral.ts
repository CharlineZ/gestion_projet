import { Mistral } from '@mistralai/mistralai';

export const MODEL = 'mistral-small-latest';

export class MissingApiKey extends Error {}

export function getClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new MissingApiKey('MISTRAL_API_KEY manquante côté serveur : crée un fichier .env (voir .env.example).');
  return new Mistral({ apiKey });
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error("La réponse de l'IA ne contient pas d'objet JSON.");
  return text.slice(start, end + 1);
}

export async function completeJson(client: Mistral, system: string, user: string): Promise<unknown> {
  const res = await client.chat.complete({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    responseFormat: { type: 'json_object' },
  });
  const content = res.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  return JSON.parse(extractJsonObject(text));
}
