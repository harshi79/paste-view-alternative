/**
 * Email delivery — provider/service layer.
 *
 * The rest of the auth system depends ONLY on `sendEmail` / `isEmailEnabled`
 * below, so the concrete provider (Resend today) can be swapped later
 * without touching the OTP/recovery logic.
 *
 * Configuration (environment only — never hardcoded, never committed):
 *   RESEND_API_KEY   Resend API key. Required for email delivery.
 *   RESEND_FROM      Optional sender address (default: VibeBin <onboarding@resend.dev>)
 *   RESEND_API_URL   Optional API base override (default: https://api.resend.com)
 *                    — exists so the service can be pointed at a mock in
 *                    local testing without changing application code.
 */

export interface EmailProvider {
  /** Whether this provider has everything it needs to deliver (e.g. API key). */
  readonly configured: boolean;

  /**
   * Sends a plain-text/HTML email. Resolves true on provider acceptance,
   * false when sending is impossible (no key) or the provider rejected it.
   * Never throws for expected failure modes.
   */
  send(to: string, subject: string, html: string): Promise<boolean>;
}

class ResendProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = (process.env.RESEND_API_KEY ?? '').trim();
    this.from =
      (process.env.RESEND_FROM ?? '').trim() || 'VibeBin <onboarding@resend.dev>';
    this.baseUrl = (process.env.RESEND_API_URL ?? '').trim() || 'https://api.resend.com';
  }

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.configured) return false;
    try {
      const res = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to, subject, html }),
      });
      if (!res.ok) {
        // Log (not expose) provider errors; the caller treats any failure
        // as "email unavailable" and never leaks details to end users.
        console.error(`[email] Resend responded ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[email] Resend request failed:', err);
      return false;
    }
  }
}

const g = globalThis as unknown as { __vibemail?: EmailProvider };

function provider(): EmailProvider {
  if (!g.__vibemail) g.__vibemail = new ResendProvider();
  return g.__vibemail;
}

/** Whether a real email provider is configured (RESEND_API_KEY present). */
export function isEmailEnabled(): boolean {
  return provider().configured;
}

/** Sends an email via the configured provider. Resolves false when unavailable. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  return provider().send(to, subject, html);
}

/**
 * OTP email body. The code is rendered plainly (no images/tracking) and the
 * message makes clear it is one-time and short-lived.
 */
export function otpEmailHtml(code: string, context: 'verify' | 'recovery'): string {
  const title =
    context === 'verify'
      ? 'Verify your recovery email'
      : 'Your VibeBin password recovery code';
  const lead =
    context === 'verify'
      ? 'Use this code to confirm your recovery email:'
      : 'Use this code to reset your VibeBin password:';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0b0b12;color:#e4e4e7;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;">
    <div style="max-width:480px;margin:0 auto;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;background:#12121c;">
      <h1 style="font-size:18px;margin:0 0 12px;color:#ffffff;">${title}</h1>
      <p style="font-size:14px;margin:0 0 18px;">${lead}</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:14px;border:1px dashed rgba(255,255,255,0.25);border-radius:12px;background:rgba(139,92,246,0.08);color:#c4b5fd;">${code}</div>
      <p style="font-size:12px;color:#a1a1aa;margin:18px 0 0;">
        This code expires in 10 minutes and can be used only once.
        If you did not request it, you can ignore this email — your account is not affected.
      </p>
    </div>
  </body>
</html>`;
}
