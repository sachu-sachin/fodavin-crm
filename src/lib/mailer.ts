import "server-only";
import nodemailer from "nodemailer";

/**
 * Outgoing email over SMTP, so any mailbox provider works (Zoho Mail, Google
 * Workspace, Brevo, Resend, …). See docs/email-reminders.md.
 */
export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** e.g. "Fodavin OS <os@fodavin.com>". */
  from: string;
}

export function mailConfig(): MailConfig | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;
  const port = Number(SMTP_PORT || 587);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { host: SMTP_HOST, port, user: SMTP_USER, pass: SMTP_PASS, from: SMTP_FROM };
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function createMailer(config: MailConfig) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS (required, not optional).
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.pass },
    // One connection reused for the whole run, instead of a new TCP + TLS +
    // login per email (slow, and providers rate-limit repeated logins).
    pool: true,
    maxConnections: 1,
  });
  return {
    async send(mail: OutgoingMail): Promise<void> {
      await transport.sendMail({ from: config.from, ...mail });
    },
    /** Close the pooled connection once the run is over. */
    close(): void {
      transport.close();
    },
  };
}
