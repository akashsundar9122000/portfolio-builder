import type { Draft } from "./schema";
import { emptyDraft } from "./defaults";

/**
 * The three example portfolios on the landing page — different people,
 * different careers, different themes. Fictional, and rendered with no
 * photo or voice so they're pure `renderSite` output.
 */

export interface Sample {
  id: string;
  name: string;
  role: string;
  themeId: string;
  themeName: string;
  blurb: string;
  draft: () => Draft;
}

function base(themeId: string): Draft {
  const d = emptyDraft(0);
  d.meta.id = `sample-${themeId}`;
  d.meta.themeId = themeId;
  return d;
}

function developer(): Draft {
  const d = base("midnight-indigo");
  d.identity = {
    ...d.identity,
    name: "Arjun Mehta",
    headline: ["I build", "fast, calm", "software"],
    roles: ["Full-stack Developer", "TypeScript · Go"],
    creed: ["Ship small, ship often.", "Boring tech, bold products."],
    signature: "Arjun",
    location: "Bengaluru, India",
    email: "arjun.mehta@example.com",
    socials: [
      { kind: "github", url: "https://github.com/example" },
      { kind: "linkedin", url: "https://www.linkedin.com/in/example" },
    ],
    bioShort: "Full-stack developer who turns messy workflows into fast, reliable web products.",
    bioLong:
      "I’m a full-stack developer with five years of building SaaS products end to end — from Postgres schemas and Go services to React interfaces people enjoy using.\n\nI care about performance budgets, good defaults and code the next person can read. Lately I’ve been leading a small team that rebuilt our billing platform with zero downtime.",
  };
  d.stats = [
    { id: "s1", value: "5+", label: "Years shipping" },
    { id: "s2", value: "40+", label: "Releases a year" },
    { id: "s3", value: "99.98%", label: "Uptime owned" },
    { id: "s4", value: "3", label: "Open-source libs" },
  ];
  d.projects = [
    { id: "p1", title: "Ledgerly", tagline: "Subscription billing rebuilt without downtime.", description: "Migrated 1.2M invoices from a monolith to event-sourced Go services behind a feature flag, then retired the old system in a weekend.", liveUrl: "https://example.com", repoUrl: "", tech: ["Go", "Postgres", "Kafka"], metrics: [{ label: "Invoice time", value: "−82%" }, { label: "Incidents", value: "0" }], cover: null, featured: true },
    { id: "p2", title: "Pulseboard", tagline: "Real-time ops dashboard for support teams.", description: "WebSocket dashboard that surfaces queue spikes before customers notice. Built with Next.js and a tiny Redis stream consumer.", liveUrl: "", repoUrl: "https://github.com/example", tech: ["Next.js", "Redis", "WebSockets"], metrics: [{ label: "Teams using", value: "30" }], cover: null, featured: false },
    { id: "p3", title: "tiny-cron", tagline: "A 2 kB scheduler for serverless functions.", description: "Open-source cron parser and scheduler with zero dependencies, used in production by a few thousand projects.", liveUrl: "", repoUrl: "https://github.com/example", tech: ["TypeScript"], metrics: [{ label: "Weekly downloads", value: "18k" }], cover: null, featured: false },
  ];
  d.experience = [
    { id: "e1", role: "Senior Software Engineer", company: "Finlytic", companyUrl: "", location: "Bengaluru", start: "Mar 2023", end: "", description: "Lead engineer on the billing platform.", highlights: ["Led a four-person team through a zero-downtime billing migration.", "Cut p95 API latency from 480 ms to 90 ms."], tech: ["Go", "React", "AWS"] },
    { id: "e2", role: "Software Engineer", company: "Kitebyte", companyUrl: "", location: "Pune", start: "Jul 2020", end: "Feb 2023", description: "Built customer-facing features across the stack.", highlights: ["Shipped the self-serve onboarding flow used by 20k companies."], tech: ["TypeScript", "Node.js", "Postgres"] },
  ];
  d.education = [{ id: "ed1", degree: "B.Tech, Computer Science", institution: "NIT Trichy", start: "2016", end: "2020", grade: "8.7 CGPA", note: "" }];
  d.skillGroups = [
    { id: "g1", label: "Languages", skills: ["TypeScript", "Go", "SQL", "Python"] },
    { id: "g2", label: "Frameworks", skills: ["React", "Next.js", "Node.js", "gRPC"] },
    { id: "g3", label: "Tools", skills: ["Postgres", "Redis", "Kafka", "AWS", "Docker"] },
  ];
  d.awards = [{ id: "a1", title: "Engineering Excellence Award", issuer: "Finlytic", year: "2024", url: "", note: "For the billing migration." }];
  return d;
}

function marketer(): Draft {
  const d = base("sunset-coral");
  d.identity = {
    ...d.identity,
    name: "Priya Nair",
    headline: ["I grow", "brands people", "remember"],
    roles: ["Marketing Manager", "Brand & Growth"],
    creed: ["Know the customer.", "Measure what matters."],
    signature: "Priya",
    location: "Mumbai, India",
    email: "priya.nair@example.com",
    socials: [
      { kind: "linkedin", url: "https://www.linkedin.com/in/example" },
      { kind: "instagram", url: "https://instagram.com/example" },
      { kind: "medium", url: "https://medium.com/@example" },
    ],
    bioShort: "Marketing manager who blends storytelling with data to grow consumer brands.",
    bioLong:
      "I lead brand and growth marketing for consumer products — campaigns, content, performance and community.\n\nOver seven years I’ve launched three D2C brands, grown a newsletter to 120k readers and built marketing teams that test weekly and report honestly.",
  };
  d.stats = [
    { id: "s1", value: "7", label: "Years in marketing" },
    { id: "s2", value: "3", label: "Brands launched" },
    { id: "s3", value: "4.2×", label: "Average ROAS" },
    { id: "s4", value: "120k", label: "Newsletter readers" },
  ];
  d.projects = [
    { id: "p1", title: "Brewhaus Launch", tagline: "From zero to 50k customers in six months.", description: "Positioning, identity brief, influencer seeding and a launch-week drop that sold out in 36 hours.", liveUrl: "https://example.com", repoUrl: "", tech: ["Brand strategy", "Influencer", "Meta Ads"], metrics: [{ label: "Customers", value: "50k" }, { label: "CAC", value: "−38%" }], cover: null, featured: true },
    { id: "p2", title: "The Sunday Letter", tagline: "A newsletter people actually open.", description: "Weekly editorial newsletter that became the brand’s biggest owned channel.", liveUrl: "", repoUrl: "", tech: ["Content", "Email", "Community"], metrics: [{ label: "Open rate", value: "54%" }], cover: null, featured: false },
    { id: "p3", title: "Festive ’24 Campaign", tagline: "An integrated campaign across 6 channels.", description: "Film, OOH, social and performance working from one idea; the brand’s best quarter to date.", liveUrl: "", repoUrl: "", tech: ["Integrated", "OOH", "YouTube"], metrics: [{ label: "Revenue", value: "+61% YoY" }], cover: null, featured: false },
  ];
  d.experience = [
    { id: "e1", role: "Marketing Manager", company: "Brewhaus Coffee", companyUrl: "", location: "Mumbai", start: "Jan 2022", end: "", description: "Own brand, content and performance marketing.", highlights: ["Built and lead a team of six.", "Grew repeat purchase rate from 22% to 41%."], tech: ["GA4", "Meta Ads", "Klaviyo"] },
    { id: "e2", role: "Brand Executive", company: "Glow & Co.", companyUrl: "", location: "Mumbai", start: "Jun 2018", end: "Dec 2021", description: "Launched two skincare lines.", highlights: ["Ran the brand’s first influencer programme (300+ creators)."], tech: ["Canva", "HubSpot"] },
  ];
  d.education = [{ id: "ed1", degree: "MBA, Marketing", institution: "NMIMS Mumbai", start: "2016", end: "2018", grade: "", note: "" }];
  d.skillGroups = [
    { id: "g1", label: "Strategy", skills: ["Brand positioning", "Go-to-market", "Customer research"] },
    { id: "g2", label: "Channels", skills: ["Performance ads", "SEO", "Email", "Influencer", "Community"] },
    { id: "g3", label: "Tools", skills: ["GA4", "Meta Ads Manager", "HubSpot", "Figma", "Looker Studio"] },
  ];
  d.awards = [{ id: "a1", title: "Best D2C Launch", issuer: "Indian Marketing Awards", year: "2023", url: "", note: "Brewhaus Coffee." }];
  return d;
}

function student(): Draft {
  const d = base("paper-ink");
  d.identity = {
    ...d.identity,
    name: "Rahul Das",
    headline: ["Curious", "about how", "things work"],
    roles: ["Computer Science Graduate", "Aspiring ML Engineer"],
    creed: ["Learn in public.", "Finish what you start."],
    signature: "Rahul",
    location: "Kolkata, India",
    email: "rahul.das@example.com",
    socials: [
      { kind: "github", url: "https://github.com/example" },
      { kind: "linkedin", url: "https://www.linkedin.com/in/example" },
      { kind: "leetcode", url: "https://leetcode.com/example" },
    ],
    bioShort: "Fresh CS graduate who loves machine learning, clean code and explaining things simply.",
    bioLong:
      "I just finished my B.Tech in Computer Science and I’m looking for my first role in machine learning or backend engineering.\n\nIn college I built a crop-disease detector used by local farmers, interned at a fintech startup and ran the coding club’s weekly workshops.",
  };
  d.stats = [
    { id: "s1", value: "9.1", label: "CGPA" },
    { id: "s2", value: "600+", label: "LeetCode problems" },
    { id: "s3", value: "2", label: "Internships" },
    { id: "s4", value: "12", label: "Workshops taught" },
  ];
  d.projects = [
    { id: "p1", title: "LeafCheck", tagline: "Spot crop disease from a phone photo.", description: "A MobileNet model fine-tuned on 18k leaf images, served through a small FastAPI app that works on slow connections.", liveUrl: "", repoUrl: "https://github.com/example", tech: ["Python", "PyTorch", "FastAPI"], metrics: [{ label: "Accuracy", value: "94%" }, { label: "Farmers using", value: "200+" }], cover: null, featured: true },
    { id: "p2", title: "CampusCart", tagline: "Buy and sell books inside the campus.", description: "A React Native app with chat and UPI links, built with two classmates for our final-year project.", liveUrl: "", repoUrl: "https://github.com/example", tech: ["React Native", "Firebase"], metrics: [{ label: "Students", value: "1.5k" }], cover: null, featured: false },
  ];
  d.experience = [
    { id: "e1", role: "Software Engineering Intern", company: "PayNest", companyUrl: "", location: "Remote", start: "May 2025", end: "Jul 2025", description: "Backend intern on the payments team.", highlights: ["Wrote a reconciliation job that caught ₹4L of mismatches in its first month."], tech: ["Java", "Spring Boot"] },
  ];
  d.education = [
    { id: "ed1", degree: "B.Tech, Computer Science", institution: "Jadavpur University", start: "2022", end: "2026", grade: "9.1 CGPA", note: "Coding club lead, 2025." },
  ];
  d.skillGroups = [
    { id: "g1", label: "Languages", skills: ["Python", "Java", "C++", "SQL"] },
    { id: "g2", label: "ML & Data", skills: ["PyTorch", "scikit-learn", "Pandas"] },
    { id: "g3", label: "Tools", skills: ["Git", "Docker", "FastAPI", "Firebase"] },
  ];
  d.awards = [{ id: "a1", title: "Smart India Hackathon — Finalist", issuer: "Govt. of India", year: "2024", url: "", note: "LeafCheck." }];
  return d;
}

export const SAMPLES: Sample[] = [
  { id: "developer", name: "Arjun Mehta", role: "Full-stack Developer", themeId: "midnight-indigo", themeName: "Midnight Indigo", blurb: "Five years of shipping SaaS — projects with real metrics, a clear career timeline.", draft: developer },
  { id: "marketer", name: "Priya Nair", role: "Marketing Manager", themeId: "sunset-coral", themeName: "Sunset Coral", blurb: "Campaigns and brand launches told as stories, with the numbers that prove them.", draft: marketer },
  { id: "student", name: "Rahul Das", role: "Computer Science Graduate", themeId: "paper-ink", themeName: "Paper & Ink", blurb: "A fresher’s first portfolio: projects, internship, grades and hackathons.", draft: student },
];

export const sampleById = (id: string) => SAMPLES.find((s) => s.id === id);
