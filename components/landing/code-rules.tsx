import { CalendarClock, Download, KeyRound, MailCheck, RefreshCw, UserCheck } from "lucide-react";

/** Everything about access codes, spelled out before anyone asks for one. */
const RULES = [
  { icon: MailCheck, title: "Request, then check your inbox", body: "Ask for a code with your name and email. Requests go to support.folioforge@gmail.com and are approved by hand, usually within 24 hours. Check spam or promotions if it hasn’t arrived." },
  { icon: UserCheck, title: "Your code is yours alone", body: "Every code is unique and tied to the email it was sent to. Sign in with that same email and code — a code on its own, or with another email, won’t work." },
  { icon: KeyRound, title: "One code, one portfolio", body: "A code builds a single portfolio. Edit, preview and use the AI helpers as much as you like while you build." },
  { icon: Download, title: "Used up after both downloads", body: "When you’ve downloaded both the ZIP and the single HTML file, the code is used up and you’re signed out. Until then you can re-download the same format freely. The resume PDF doesn’t count." },
  { icon: CalendarClock, title: "Valid for 7 days", body: "A code stops working 7 days after it’s issued, whether or not you’ve downloaded. Your draft lives only in your browser and is deleted after 7 days too." },
  { icon: RefreshCw, title: "Need another? Ask again", body: "For a new portfolio — or once a code is used or expired — request a new code. You can hold one active code per email at a time." },
];

export function CodeRules() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {RULES.map((r) => (
        <li key={r.title} className="card p-6">
          <r.icon className="text-accent size-5" aria-hidden />
          <h3 className="mt-4 font-semibold">{r.title}</h3>
          <p className="text-text-2 mt-2 text-[15px] leading-relaxed">{r.body}</p>
        </li>
      ))}
    </ul>
  );
}
