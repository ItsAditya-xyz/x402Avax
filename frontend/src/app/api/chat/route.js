// app/api/chat/route.js
export const runtime = 'nodejs';
import { GoogleGenAI } from '@google/genai';

const FORM_SENTINEL = '[[FORM_BUILDER]]';

const DEFAULT_SYSTEM = `
You are Gladius, AI agent of Arena.social (https://arena.social), a crypto social app, being run as an assistant UI on this page. You have many features like: scaning arena users,
tool chaining various fetures to give concrete response on the platform itself by tagging you @ArenaGladiuis. But on this page, your job only is to help users gate their APIs using x402 protocol that is built by big brain at Gladius team. DO NOT DO ANYTHING ELSE APART FROM THIS, always stick to what you have been told to do here. ALWAYS BE SUPER SHORT AND CONCISE, USE AS MANY LESS WORDS AS YOU CAN.

WHEN the user is asking to gate an API, set up pay-per-call, use the 402/X402 gateway, or
otherwise wants to configure a paid API, you MUST output exactly this token on its own line. 

More info about the form: 

Description: To be shown to user even without payment
Merchant address: Only EVM address, where one will receive the payment
Token: select from the dropdown- AVAX, GLADIUS and ARENA supported only
Amount: numeric input in units of the token (e.g., 10.5)
session: by default 5, defines how long someone can fetch the API response post payment is done. 
 

${FORM_SENTINEL}

Do NOT explain it, do NOT put backticks, code fences, or extra words before/after it.
In all other cases, respond normally.
`.trim();

function toHistory(messages = []) {
  // const systemFromClient = messages.find(m => m.role === 'system')?.content;
  const system = [DEFAULT_SYSTEM].filter(Boolean).join('\n\n');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content ?? '' }],
    }));
  return { system, contents };
}

export async function POST(req) {
  try {
    const { messages = [], stream = true, model = 'gemini-2.5-flash' } =
      (await req.json().catch(() => ({}))) || {};

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GENAI_API_KEY;
    if (!apiKey) return new Response('Server misconfig: API key missing', { status: 500 });

    const ai = new GoogleGenAI({ apiKey });
    const { system, contents } = toHistory(messages);

    const config = {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 2048,
      systemInstruction: system,
    };

    if (!stream) {
      const resp = await ai.models.generateContent({ model, contents, config });
      const text = resp.text ?? '';
      return new Response(text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
      });
    }

    const resp = await ai.models.generateContentStream({ model, contents, config });
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of resp) {
            const piece = chunk?.text ?? '';
            if (piece) controller.enqueue(encoder.encode(piece));
          }
        } catch {
          controller.enqueue(encoder.encode('\n[stream error]\n'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return new Response(e?.message || 'Bad request', { status: 400 });
  }
}

export async function GET() { return new Response('OK', { status: 200 }); }
