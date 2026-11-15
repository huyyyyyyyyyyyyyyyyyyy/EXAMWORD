import { AppError, str } from './http.mjs';

const env = (name) => str(globalThis.Deno?.env?.get?.(name) ?? globalThis.process?.env?.[name], 4096);
const equalHex = (a, b) => {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  const left = new Uint8Array(a.match(/.{2}/g).map((x) => parseInt(x, 16)));
  const right = new Uint8Array(b.match(/.{2}/g).map((x) => parseInt(x, 16)));
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
};
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function paymentStatus() {
  return { webhookConfigured: Boolean(env('PAYMENT_WEBHOOK_SECRET')), autoPayout: env('PAYMENT_AUTO_PAYOUT') === 'true' && Boolean(env('PAYMENT_PROVIDER_BASE_URL') && env('PAYMENT_PROVIDER_TOKEN')) };
}

export async function verifyPaymentWebhook(request) {
  const secret = env('PAYMENT_WEBHOOK_SECRET');
  if (!secret) throw new AppError('payment_webhook_not_configured', 503);
  const timestamp = str(request.headers.get('x-webhook-timestamp'), 40);
  const signature = str(request.headers.get('x-webhook-signature'), 128).toLowerCase();
  if (!/^[0-9]{10,16}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp))) > 300000) throw new AppError('invalid_webhook_signature', 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 65536) throw new AppError('payload_too_large', 413);
  const expected = await hmac(secret, `${timestamp}.${raw}`);
  if (!equalHex(signature, expected)) throw new AppError('invalid_webhook_signature', 401);
  let body;
  try { body = JSON.parse(raw); } catch { throw new AppError('invalid_webhook_payload', 400); }
  const event = {
    eventId: str(body?.eventId, 120),
    transactionId: str(body?.transactionId, 120),
    reference: str(body?.reference, 40).toUpperCase(),
    amount: body?.amount,
    paidAt: str(body?.paidAt, 60),
  };
  if (!event.eventId || !event.transactionId || !/^EW[A-Z0-9]{10}$/.test(event.reference) || !Number.isInteger(event.amount) || event.amount < 0 || event.amount > 1000000000) throw new AppError('invalid_webhook_payload', 400);
  if (event.paidAt && !Number.isFinite(Date.parse(event.paidAt))) throw new AppError('invalid_webhook_payload', 400);
  return event;
}

export async function executeAutomaticPayout(order, bank) {
  if (!paymentStatus().autoPayout) return null;
  const rawBase = env('PAYMENT_PROVIDER_BASE_URL');
  let endpoint;
  try {
    const base = new URL(rawBase);
    const local = ['127.0.0.1', 'localhost'].includes(base.hostname);
    if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) || base.username || base.password) throw new Error('invalid');
    endpoint = new URL(env('PAYMENT_PAYOUT_PATH') || '/payouts', base);
    if (endpoint.origin !== base.origin) throw new Error('invalid');
  } catch { throw new AppError('payment_provider_unavailable', 503); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${env('PAYMENT_PROVIDER_TOKEN')}`, 'content-type': 'application/json', 'idempotency-key': order.id },
      body: JSON.stringify({
        reference: order.reference,
        amount: order.teacher_amount,
        currency: 'VND',
        destination: { bankName: bank.bank_name, accountNumber: bank.account_number, accountName: bank.account_name },
        description: `ExamWorld teacher payout ${order.reference}`,
        ...(env('PAYMENT_PROVIDER_ACCOUNT_ID') ? { sourceAccountId: env('PAYMENT_PROVIDER_ACCOUNT_ID') } : {}),
      }),
      signal: controller.signal,
      redirect: 'error',
    });
    const text = await response.text();
    if (text.length > 65536 || !response.ok) throw new AppError('payout_rejected', 502);
    let result;
    try { result = JSON.parse(text); } catch { throw new AppError('payout_rejected', 502); }
    const payoutId = str(result?.payoutId ?? result?.id, 120);
    if (!payoutId || !['paid', 'completed', 'success'].includes(str(result?.status, 30).toLowerCase())) throw new AppError('payout_rejected', 502);
    return { payoutId };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('payment_provider_unavailable', 503);
  } finally { clearTimeout(timeout); }
}
