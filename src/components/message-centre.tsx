import { useEffect, useMemo, useState } from "react";
import { Bell, BellRing, X, AlertTriangle, DatabaseBackup, Receipt, PartyPopper, Sparkles, CheckCircle2 } from "lucide-react";

import { useBackupReminder } from "@/lib/company-books";
import { supabase } from "@/integrations/supabase/client";

const MONDAY = [
  "New week, fresh plans — let's make every campaign count, {n}!",
  "Happy Monday, {n}! Coffee first, release orders next.",
  "{n}, a brand-new week to build something great. Go for it!",
  "Monday magic, {n} — small steps today, big wins by Friday.",
  "Rise and shine, {n}! This week's schedule is yours to own.",
  "Hello {n}! Start the week strong and the rest will follow.",
];
const DAILY = [
  "Success is the sum of small efforts, repeated day in and day out. — Robert Collier",
  "The secret of getting ahead is getting started. — Mark Twain",
  "Quality is not an act, it is a habit. — Aristotle",
  "Great things are done by a series of small things brought together. — Vincent van Gogh",
  "Believe you can and you're halfway there. — Theodore Roosevelt",
  "Do what you can, with what you have, where you are. — Theodore Roosevelt",
  "It always seems impossible until it's done. — Nelson Mandela",
  "Hard work beats talent when talent doesn't work hard. — Tim Notke",
  "Don't watch the clock; do what it does. Keep going. — Sam Levenson",
  "The best way to predict the future is to create it. — Peter Drucker",
  "Arise, awake, and stop not till the goal is reached. — Swami Vivekananda",
  "You have to dream before your dreams can come true. — A. P. J. Abdul Kalam",
  "Small daily improvements lead to stunning results. — Robin Sharma",
  "Action is the foundational key to all success. — Pablo Picasso",
  "Opportunities don't happen. You create them. — Chris Grosser",
];
const FEST = [
  "Wishing you and your family a joyful {f}, {n}!",
  "Happy {f}, {n}! May the day bring you peace and happiness.",
  "{n}, warm {f} wishes — enjoy every moment of the celebration.",
  "May this {f} light up your home and heart, {n}.",
];
function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function partOfDay(h: number) { return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night"; }

type Reminder = { id: string; title: string; text: string; action?: () => void };

const FESTIVALS: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "New Year" },
  { date: "2026-01-14", name: "Pongal" },
  { date: "2026-01-26", name: "Republic Day" },
  { date: "2026-03-04", name: "Holi" },
  { date: "2026-03-20", name: "Ramzan (Eid al-Fitr)" },
  { date: "2026-04-14", name: "Tamil New Year" },
  { date: "2026-05-27", name: "Bakrid" },
  { date: "2026-08-15", name: "Independence Day" },
  { date: "2026-09-14", name: "Ganesh Chaturthi" },
  { date: "2026-10-19", name: "Ayudha Pooja" },
  { date: "2026-10-20", name: "Vijayadashami" },
  { date: "2026-11-08", name: "Diwali" },
  { date: "2026-12-25", name: "Christmas" },
  { date: "2027-01-01", name: "New Year" },
  { date: "2027-01-15", name: "Pongal" },
  { date: "2027-01-26", name: "Republic Day" },
  { date: "2027-03-10", name: "Ramzan (Eid al-Fitr)" },
  { date: "2027-03-22", name: "Holi" },
  { date: "2027-04-14", name: "Tamil New Year" },
  { date: "2027-08-15", name: "Independence Day" },
  { date: "2027-09-04", name: "Ganesh Chaturthi" },
  { date: "2027-10-29", name: "Diwali" },
  { date: "2027-12-25", name: "Christmas" },
];

const DISMISS_KEY = "athene.reminders.dismissed";
const DAY = 86400000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Reminders re-appear three times a day: morning, afternoon, evening. */
function dayPart(d: Date) {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

/** Reminder bell — weekly backup, festival wishes to clients, and GST filing dates. */
export function MessageCentre({ onOpenBackup }: { onOpenBackup: () => void }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [today, setToday] = useState<number | null>(null);
  const backup = useBackupReminder();
  const [hour, setHour] = useState(() => new Date().getHours());
  const [who, setWho] = useState<{ name: string; key: string }>({ name: "", key: "" });
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      const meta = (u?.user_metadata ?? {}) as Record<string, string>;
      const raw = meta['full_name'] || meta['name'] || (u?.email ?? "").split("@")[0] || "there";
      setWho({ name: raw.charAt(0).toUpperCase() + raw.slice(1), key: u?.id ?? raw });
    });
  }, []);
  const greeting = useMemo(() => {
    if (today === null || !who.name) return null;
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const seed = hash(`${who.key}|${iso}`);
    const fest = FESTIVALS.find((f) => f.date === iso);
    const fill = (t: string) => t.replace("{n}", who.name).replace("{f}", fest?.name ?? "");
    if (fest) return { title: `Happy ${fest.name}, ${who.name}!`, text: fill(FEST[seed % FEST.length]!) };
    if (now.getDay() === 1) return { title: `${partOfDay(now.getHours())}, ${who.name}`, text: fill(MONDAY[seed % MONDAY.length]!) };
    return { title: `${partOfDay(now.getHours())}, ${who.name}`, text: fill(DAILY[seed % DAILY.length]!) };
  }, [today, who, hour]);

  // Re-check every minute so the greeting moves morning → afternoon → evening → night.
  useEffect(() => {
    const t = setInterval(() => { setHour(new Date().getHours()); setToday(startOfDay(new Date())); }, 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setToday(startOfDay(new Date()));
    try {
      setDismissed(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]"));
    } catch {
      setDismissed([]);
    }
  }, []);

  const reminders = useMemo<Reminder[]>(() => {
    const list: Reminder[] = [];
    if (backup.due)
      list.push({
        id: "backup",
        title: "Weekly backup due",
        text: `${backup.companyName || "This company"} has no backup this week.`,
        action: () => {
          setOpen(false);
          onOpenBackup();
        },
      });
    if (today === null) return list;
    for (const f of FESTIVALS) {
      const [y = 0, m = 1, d = 1] = f.date.split("-").map(Number);
      const days = Math.round((new Date(y, m - 1, d).getTime() - today) / DAY);
      if (days < 0 || days > 3) continue;
      list.push({
        id: `fest-${f.date}`,
        title: days === 0 ? `Today is ${f.name}` : `${f.name} in ${days} day${days > 1 ? "s" : ""}`,
        text: days === 0 ? "Send festival wishes to your clients and vendors." : "Plan festival wishes and greeting creatives for clients.",
      });
    }
    const now = new Date(today);
    const dom = now.getDate();
    const ym = `${now.getFullYear()}-${now.getMonth() + 1}`;
    if (dom >= 4 && dom <= 7)
      list.push({ id: `tds-${ym}`, title: "TDS deposit due on the 7th", text: "Deposit last month's TDS (challan 281) to avoid interest." });
    if (dom >= 8 && dom <= 11)
      list.push({ id: `gstr1-${ym}`, title: "GSTR-1 due on the 11th", text: "File last month's outward invoices." });
    if (dom >= 17 && dom <= 20)
      list.push({ id: `gstr3b-${ym}`, title: "GSTR-3B due on the 20th", text: "File the monthly GST return and pay tax." });
    if ([1, 5, 7, 10].includes(now.getMonth() + 1) && (dom >= 27 || dom <= 1))
      list.push({ id: `tdsq-${ym}`, title: "Quarterly TDS return (24Q/26Q)", text: "File the TDS return by the 31st of Jul / Oct / Jan / May." });
    const part = today === null ? "" : dayPart(new Date());
    return list.filter((r) => r.id === "backup" || !dismissed.includes(`${r.id}|${part}`));
  }, [backup.due, backup.companyName, today, dismissed, onOpenBackup]);

  /** Dismiss hides the reminder only for this part of the day; it returns in the next one. */
  const dismiss = (id: string) => {
    const key = `${id}|${dayPart(new Date())}`;
    const next = [...dismissed, key];
    setDismissed(next);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  };

  const count = reminders.length;

  return (
    <div className="msg-centre">
      <button
        className={`nb-bell ${count ? "due" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label="Reminders"
      >
        {count ? <BellRing size={17} /> : <Bell size={17} />}
        {count > 0 && <span className="nb-badge"><AlertTriangle size={9} />{count > 9 ? "9+" : count}</span>}
      </button>

      {open && (
        <div className="msg-panel nb-panel">
          <header className={`nb-head ${count ? "due" : ""}`}>
            <span className="nb-head-icon">{greeting ? <Sparkles size={20} /> : count ? <BellRing size={20} /> : <CheckCircle2 size={20} />}</span>
            <div className="nb-head-text">
              <span className="nb-kicker">Message centre</span>
              <strong>{greeting?.title ?? (count ? "A reminder needs attention" : "You're all caught up")}</strong>
              <span>{greeting?.text ?? (count ? `${count} reminder${count > 1 ? "s" : ""} waiting for you` : "No reminders right now")}</span>
            </div>
            <button className="nb-close" onClick={() => setOpen(false)} aria-label="Close reminders">
              <X size={15} />
            </button>
          </header>
          <div className="nb-body">
            <div className="nb-section-head">
              <span>{count > 0 ? "Reminders" : "Today"}</span>
              {count > 0 && <strong>{count}</strong>}
            </div>
            {reminders.map((r) => {
              const id = r.id.toLowerCase();
              const Icon = id.includes("backup") ? DatabaseBackup : id.includes("gst") ? Receipt : id.includes("fest") ? PartyPopper : AlertTriangle;
              return (
                <div key={r.id} className="nb-alert">
                  <button className="nb-alert-main" onClick={r.action}>
                    <span className="nb-alert-icon"><Icon size={17} /></span>
                    <span className="nb-alert-text">
                      <strong>{r.title}</strong>
                      <span>{r.text}</span>
                    </span>
                  </button>
                  {r.id !== "backup" && (
                    <button className="nb-dismiss" onClick={() => dismiss(r.id)} aria-label="Dismiss reminder">
                      <X size={13} />
                    </button>
                  )}
                </div>
              );
            })}
            {count === 0 && (
              <div className="nb-empty">
                <span className="nb-empty-icon"><CheckCircle2 size={19} /></span>
                <div>
                  <strong>No action needed</strong>
                  <span>Your reminders are clear for now.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
