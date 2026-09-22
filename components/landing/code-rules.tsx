import { CalendarClock, Download, KeyRound, MailCheck, RefreshCw, UserCheck } from "lucide-react";

/** Everything about access codes, spelled out before anyone asks for one. */
const RULES = [
  { icon: MailCheck, title: "Request, then check your inbox", body: "Ask for a code with your name and email. Requests go to support.folioforge@gmail.com and are approved by hand, usually within 24 hours. Check spam or promotions if it hasn’t arrived." },
  { icon: UserCheck, title: "Your code is yours alone", body: "Every code is unique and tied to the email it was sent to. Sign in with that same email and code — a code on its own, or with another email, won’t work." },
  { icon: KeyRound, title: "Build as much as you like", body: "While your code is valid, edit, preview, use the AI helpers and start over as often as you want." },
  { icon: Download, title: "Download any time", body: "Download the ZIP and the single HTML file as many times as you need — downloading never uses up your code." },
  { icon: CalendarClock, title: "Valid for 7 days", body: "Your code works for 7 days from the moment it’s sent, then stops. Your draft lives only in your browser and is deleted after 7 days too." },
  { icon: RefreshCw, title: "Need another? Ask again", body: "Once your code has expired, request a new one to keep building. You can hold one active code per email at a time." },
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
