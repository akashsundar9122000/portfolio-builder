import "server-only";
import { createTransport, type Transporter } from "nodemailer";
import { env } from "./env";
import { h } from "@/lib/render/html";
import type { AccessRequest, IssuedCode } from "./codes";

/**
 * Transactional email over SMTP: any provider via SMTP_HOST/SMTP_USER/
 * SMTP_PASS (e.g. Brevo), or Gmail with an App Password. Without either,
 * the message is printed to the server log instead, so the whole flow
 * works in dev.
 */

let transport: Transporter | undefined;

const smtp = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
const gmail = () => Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
export const mailConfigured = () => smtp() || gmail();
const sender = () => env.MAIL_FROM ?? env.GMAIL_USER ?? env.ADMIN_EMAIL;

function makeTransport(): Transporter {
  if (smtp()) {
    return createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  }
  return createTransport({ service: "gmail", auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } });
}

async function send(to: string, subject: string, html: string, text: string, replyTo?: string) {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Email is not configured (SMTP_* or GMAIL_*).");
    console.info(`\n── email (not sent: SMTP not configured) ──\nTo: ${to}\nSubject: ${subject}\n\n${text}\n────────────\n`);
    return;
  }
  transport ??= makeTransport();
  await transport.sendMail({ from: `FolioForge <${sender()}>`, to, subject, html, text, replyTo: replyTo ?? env.ADMIN_EMAIL });
}

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";

// ── layout ──────────────────────────────────────────────────────────────

const INK = "#16161a";
const MUTED = "#5b5b66";
const ACCENT = "#c9812a";

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f2ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e6e2da">
<tr><td style="padding:28px 32px 8px;font:600 12px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:${ACCENT}">FolioForge</td></tr>
<tr><td style="padding:0 32px 8px"><h1 style="margin:0;font-size:22px;line-height:1.3">${h(title)}</h1></td></tr>
<tr><td style="padding:8px 32px 32px;font-size:15px;line-height:1.6">${body}</td></tr>
</table>
<p style="font-size:12px;color:${MUTED};margin:16px 0 0">FolioForge · ${h(env.ADMIN_EMAIL)}</p>
</td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 14px">${html}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${h(href)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px">${h(label)}</a></p>`;
const rows = (pairs: [string, string][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 14px;border-collapse:collapse">${pairs
    .map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;color:${MUTED};white-space:nowrap;vertical-align:top;border-top:1px solid #eee">${h(k)}</td><td style="padding:8px 0;border-top:1px solid #eee;word-break:break-word">${v}</td></tr>`)
    .join("")}</table>`;

const RULES = [
  "The code works only with this email address.",
  "It is valid for 7 days from now.",
  "It builds one portfolio: once you have downloaded both the ZIP and the single HTML file, the code is used up.",
  "You can re-download the same format as often as you like until both are done.",
  "To build another portfolio later, request a new code on the website.",
];

// ── messages ────────────────────────────────────────────────────────────

export async function mailAdminNewRequest(r: AccessRequest, link: string) {
  const subject = `Code request from ${r.name} <${r.email}>`;
  const html = layout("New access-code request", [
    p("Someone would like to build a portfolio."),
    rows([
      ["Name", h(r.name)],
      ["Email", `<a href="mailto:${h(r.email)}">${h(r.email)}</a>`],
      ["Reason", r.reason ? h(r.reason) : `<span style="color:${MUTED}">—</span>`],
      ["Requested", h(when(r.createdAt))],
    ]),
    button(link, "Generate code"),
    `<p style="margin:0;font-size:13px;color:${MUTED}">The button opens the request page, where you can regenerate the code, add a note, then send it — or reject the request.</p>`,
  ].join(""));
  const text = `New access-code request\n\nName: ${r.name}\nEmail: ${r.email}\nReason: ${r.reason || "—"}\nRequested: ${when(r.createdAt)}\n\nGenerate code: ${link}`;
  await send(env.ADMIN_EMAIL, subject, html, text, r.email);
}

export async function mailRequestReceived(r: AccessRequest) {
  const html = layout("We’ve got your request", [
    p(`Hi ${h(r.name)},`),
    p("Thanks for your interest in FolioForge. Your request for an access code has reached us. Codes are approved by hand, usually within 24 hours — we’ll email it to this address."),
    p(`If you don’t see it, please check your spam or promotions folder for mail from <strong>${h(sender())}</strong>.`),
  ].join(""));
  const text = `Hi ${r.name},\n\nThanks for your interest in FolioForge. Your request for an access code has reached us. Codes are approved by hand, usually within 24 hours — we'll email it to this address.\n\nIf you don't see it, check your spam folder.`;
  await send(r.email, "Your FolioForge code request", html, text);
}

export async function mailCode(r: AccessRequest, c: IssuedCode, site: string) {
  const html = layout("Your FolioForge access code", [
    p(`Hi ${h(r.name)}, your code is ready.`),
    `<p style="margin:18px 0;padding:18px;border-radius:12px;background:#faf6ef;border:1px dashed ${ACCENT};text-align:center;font:700 26px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em">${h(c.code)}</p>`,
    rows([
      ["Email", h(c.email)],
      ["Valid until", h(when(c.expiresAt))],
    ]),
    r.note ? `<p style="margin:0 0 14px;padding:12px 14px;border-left:3px solid ${ACCENT};background:#faf8f4"><strong>A note from Akash:</strong><br>${h(r.note).replace(/\n/g, "<br>")}</p>` : "",
    button(site, "Start building"),
    `<p style="margin:0 0 6px;font-weight:600">How your code works</p><ul style="margin:0;padding-left:20px">${RULES.map((x) => `<li style="margin:0 0 6px">${h(x)}</li>`).join("")}</ul>`,
  ].join(""));
  const text = `Hi ${r.name}, your FolioForge access code is ready.\n\nCode: ${c.code}\nEmail: ${c.email}\nValid until: ${when(c.expiresAt)}\n${r.note ? `\nA note from Akash:\n${r.note}\n` : ""}\nStart building: ${site}\n\nHow your code works:\n${RULES.map((x) => `- ${x}`).join("\n")}`;
  await send(r.email, `Your FolioForge access code: ${c.code}`, html, text);
}

export async function mailRejected(r: AccessRequest) {
  const html = layout("About your FolioForge request", [
    p(`Hi ${h(r.name)},`),
    p("Thank you for asking. We aren’t able to issue you an access code right now."),
    r.note ? `<p style="margin:0 0 14px;padding:12px 14px;border-left:3px solid ${ACCENT};background:#faf8f4">${h(r.note).replace(/\n/g, "<br>")}</p>` : "",
    p(`If you think this is a mistake, just reply to this email.`),
  ].join(""));
  const text = `Hi ${r.name},\n\nThank you for asking. We aren't able to issue you an access code right now.${r.note ? `\n\n${r.note}` : ""}\n\nIf you think this is a mistake, just reply to this email.`;
  await send(r.email, "About your FolioForge request", html, text);
}

export async function mailRevoked(r: AccessRequest, c: IssuedCode, site: string) {
  const html = layout("Your FolioForge access code was revoked", [
    p(`Hi ${h(r.name)},`),
    p(`Your access code <strong style="font-family:ui-monospace,Menlo,monospace">${h(c.code)}</strong> has been revoked and no longer works. If you were in the middle of building, you’ve been signed out.`),
    c.revokeReason ? `<p style="margin:0 0 14px;padding:12px 14px;border-left:3px solid ${ACCENT};background:#faf8f4"><strong>Reason:</strong><br>${h(c.revokeReason).replace(/\n/g, "<br>")}</p>` : "",
    p("A revoked code can’t be restored. If you’d still like to build your portfolio, request a new code on the website — your draft stays in your browser for up to 7 days after you started it."),
    button(site, "Request a new code"),
    p(`Questions? Just reply to this email.`),
  ].join(""));
  const text = `Hi ${r.name},\n\nYour access code ${c.code} has been revoked and no longer works. If you were in the middle of building, you've been signed out.${c.revokeReason ? `\n\nReason: ${c.revokeReason}` : ""}\n\nA revoked code can't be restored. If you'd still like to build your portfolio, request a new code: ${site}\n\nQuestions? Just reply to this email.`;
  await send(r.email, "Your FolioForge access code was revoked", html, text);
}
