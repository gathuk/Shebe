import type { Config, Context } from "@netlify/functions";
import { createHash } from "node:crypto";
import { promises as dnsPromises } from "node:dns";
import { parsePhoneNumber } from "libphonenumber-js/max";

// ── Constants ────────────────────────────────────────────────────────────────

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "yopmail.com",
  "trashmail.com", "sharklasers.com", "spam4.me", "dispostable.com",
  "mailnull.com", "spamgourmet.com", "trashmail.at", "trashmail.io",
  "trashmail.me", "trashmail.net", "discard.email", "fakeinbox.com",
  "maildrop.cc", "harakirimail.com", "10minutemail.com", "tempinbox.com",
  "filzmail.com", "throwam.com", "guerrillamail.info", "guerrillamail.biz",
  "guerrillamail.de", "guerrillamail.net", "guerrillamail.org",
  "tempr.email", "grr.la", "mailscrap.com", "nospam.ze.tc",
  "getairmail.com", "mailnew.com", "spamevader.com", "notmailinator.com",
]);

const MAJOR_PROVIDERS: Record<string, string> = {
  "gmail.com": "Google Gmail", "googlemail.com": "Google Gmail",
  "yahoo.com": "Yahoo Mail", "yahoo.co.uk": "Yahoo Mail",
  "yahoo.fr": "Yahoo Mail", "yahoo.co.in": "Yahoo Mail",
  "hotmail.com": "Microsoft Hotmail", "hotmail.co.uk": "Microsoft Hotmail",
  "outlook.com": "Microsoft Outlook", "live.com": "Microsoft Live",
  "msn.com": "Microsoft MSN", "icloud.com": "Apple iCloud",
  "me.com": "Apple Me", "mac.com": "Apple Mac",
  "protonmail.com": "ProtonMail", "proton.me": "ProtonMail", "pm.me": "ProtonMail",
  "tutanota.com": "Tutanota", "tuta.io": "Tutanota",
  "zoho.com": "Zoho Mail", "aol.com": "AOL Mail",
  "yandex.com": "Yandex Mail", "yandex.ru": "Yandex Mail",
  "mail.com": "Mail.com", "gmx.com": "GMX Mail", "gmx.net": "GMX Mail",
  "fastmail.com": "Fastmail", "fastmail.fm": "Fastmail",
  // Kenya / East Africa ISPs and providers
  "jambo.co.ke": "Jambo (Kenya)", "wananchi.com": "Wananchi Telecom (Kenya)",
  "swiftkenya.com": "Swift Global (Kenya)", "africaonline.co.ke": "Africa Online (Kenya)",
  "iconnect.co.ke": "iConnect (Kenya)", "kenyaweb.com": "KenyaWeb",
  "saf.co.ke": "Safaricom Mail (Kenya)", "students.uonbi.ac.ke": "University of Nairobi",
  "students.ku.ac.ke": "Kenyatta University", "strathmore.edu": "Strathmore University (Kenya)",
};

const CARRIER_PREFIXES: Record<string, { len: number; map: Record<string, string> }> = {
  "KE": { len: 4, map: {
    "0700": "Safaricom", "0701": "Safaricom", "0702": "Safaricom", "0703": "Safaricom",
    "0704": "Safaricom", "0705": "Safaricom", "0706": "Safaricom", "0707": "Safaricom",
    "0708": "Safaricom", "0709": "Safaricom", "0710": "Safaricom", "0711": "Safaricom",
    "0712": "Safaricom", "0713": "Safaricom", "0714": "Safaricom", "0715": "Safaricom",
    "0716": "Safaricom", "0717": "Safaricom", "0718": "Safaricom", "0719": "Safaricom",
    "0720": "Safaricom", "0721": "Safaricom", "0722": "Safaricom", "0723": "Safaricom",
    "0724": "Safaricom", "0725": "Safaricom", "0726": "Safaricom", "0727": "Safaricom",
    "0728": "Safaricom", "0729": "Safaricom",
    "0740": "Airtel Kenya", "0741": "Airtel Kenya", "0742": "Airtel Kenya",
    "0743": "Airtel Kenya", "0746": "Airtel Kenya", "0750": "Airtel Kenya",
    "0775": "Airtel Kenya", "0786": "Airtel Kenya", "0787": "Airtel Kenya", "0789": "Airtel Kenya",
    "0730": "Equitel", "0731": "Equitel", "0732": "Equitel",
    "0747": "Telkom Kenya", "0748": "Telkom Kenya", "0749": "Telkom Kenya",
    "0776": "Telkom Kenya", "0777": "Telkom Kenya", "0778": "Telkom Kenya", "0779": "Telkom Kenya",
  }},
  "NG": { len: 4, map: {
    "0803": "MTN Nigeria", "0806": "MTN Nigeria", "0703": "MTN Nigeria", "0706": "MTN Nigeria",
    "0813": "MTN Nigeria", "0816": "MTN Nigeria", "0810": "MTN Nigeria", "0814": "MTN Nigeria",
    "0903": "MTN Nigeria", "0906": "MTN Nigeria", "0913": "MTN Nigeria", "0916": "MTN Nigeria",
    "0802": "Airtel Nigeria", "0808": "Airtel Nigeria", "0708": "Airtel Nigeria",
    "0812": "Airtel Nigeria", "0701": "Airtel Nigeria", "0902": "Airtel Nigeria",
    "0907": "Airtel Nigeria", "0912": "Airtel Nigeria",
    "0805": "Glo Nigeria", "0807": "Glo Nigeria", "0705": "Glo Nigeria",
    "0815": "Glo Nigeria", "0811": "Glo Nigeria", "0905": "Glo Nigeria", "0915": "Glo Nigeria",
    "0809": "9mobile Nigeria", "0818": "9mobile Nigeria", "0817": "9mobile Nigeria",
    "0909": "9mobile Nigeria", "0908": "9mobile Nigeria",
  }},
  "ZA": { len: 3, map: {
    "082": "Vodacom", "072": "Vodacom", "076": "Vodacom", "079": "Vodacom",
    "083": "MTN South Africa", "073": "MTN South Africa", "078": "MTN South Africa",
    "084": "Cell C", "074": "Cell C",
    "081": "Telkom Mobile", "071": "Telkom Mobile",
  }},
  "GH": { len: 3, map: {
    "054": "MTN Ghana", "055": "MTN Ghana", "059": "MTN Ghana",
    "024": "MTN Ghana", "025": "MTN Ghana",
    "050": "Vodafone Ghana", "020": "Vodafone Ghana", "030": "Vodafone Ghana",
    "027": "AirtelTigo Ghana", "057": "AirtelTigo Ghana",
    "026": "AirtelTigo Ghana", "056": "AirtelTigo Ghana",
  }},
  "TZ": { len: 3, map: {
    "074": "Vodacom Tanzania", "075": "Vodacom Tanzania",
    "071": "Tigo Tanzania", "065": "Tigo Tanzania",
    "078": "Airtel Tanzania", "068": "Airtel Tanzania",
    "062": "Halotel Tanzania", "069": "Halotel Tanzania",
    "077": "TTCL Tanzania",
  }},
  "UG": { len: 3, map: {
    "077": "MTN Uganda", "078": "MTN Uganda", "076": "MTN Uganda",
    "070": "Airtel Uganda", "075": "Airtel Uganda",
    "079": "Africell Uganda",
  }},
};

function getCarrier(nationalNumber: string, regionCode: string): string {
  const info = CARRIER_PREFIXES[regionCode];
  if (!info) return "Unknown";
  const local = nationalNumber.startsWith("0") ? nationalNumber : `0${nationalNumber}`;
  const prefix = local.slice(0, info.len);
  return info.map[prefix] ?? "Unknown";
}

const COUNTRY_TIMEZONES: Record<string, string[]> = {
  "US": ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
  "GB": ["Europe/London"], "CA": ["America/Toronto", "America/Vancouver"],
  "AU": ["Australia/Sydney", "Australia/Melbourne", "Australia/Perth"],
  "DE": ["Europe/Berlin"], "FR": ["Europe/Paris"], "IT": ["Europe/Rome"],
  "ES": ["Europe/Madrid"], "NL": ["Europe/Amsterdam"], "CH": ["Europe/Zurich"],
  "SE": ["Europe/Stockholm"], "NO": ["Europe/Oslo"], "DK": ["Europe/Copenhagen"],
  "FI": ["Europe/Helsinki"], "PL": ["Europe/Warsaw"], "RU": ["Europe/Moscow"],
  "BR": ["America/Sao_Paulo"], "MX": ["America/Mexico_City"], "AR": ["America/Argentina/Buenos_Aires"],
  "IN": ["Asia/Kolkata"], "CN": ["Asia/Shanghai"], "JP": ["Asia/Tokyo"],
  "KR": ["Asia/Seoul"], "SG": ["Asia/Singapore"], "HK": ["Asia/Hong_Kong"],
  "TH": ["Asia/Bangkok"], "MY": ["Asia/Kuala_Lumpur"], "ID": ["Asia/Jakarta"],
  "PH": ["Asia/Manila"], "VN": ["Asia/Ho_Chi_Minh"],
  "ZA": ["Africa/Johannesburg"], "NG": ["Africa/Lagos"], "KE": ["Africa/Nairobi"],
  "GH": ["Africa/Accra"], "EG": ["Africa/Cairo"], "MA": ["Africa/Casablanca"],
  "TZ": ["Africa/Dar_es_Salaam"], "UG": ["Africa/Kampala"], "ET": ["Africa/Addis_Ababa"],
  "RW": ["Africa/Kigali"], "SN": ["Africa/Dakar"], "CI": ["Africa/Abidjan"],
  "CM": ["Africa/Douala"], "AO": ["Africa/Luanda"], "MZ": ["Africa/Maputo"],
  "AE": ["Asia/Dubai"], "SA": ["Asia/Riyadh"], "TR": ["Europe/Istanbul"],
  "PK": ["Asia/Karachi"], "BD": ["Asia/Dhaka"],
  "NZ": ["Pacific/Auckland"], "IE": ["Europe/Dublin"], "PT": ["Europe/Lisbon"],
  "IL": ["Asia/Jerusalem"],
};

const COUNTRY_NAMES: Record<string, string> = {
  "US": "United States", "GB": "United Kingdom", "CA": "Canada",
  "AU": "Australia", "DE": "Germany", "FR": "France", "IT": "Italy",
  "ES": "Spain", "NL": "Netherlands", "BE": "Belgium", "CH": "Switzerland",
  "AT": "Austria", "SE": "Sweden", "NO": "Norway", "DK": "Denmark",
  "FI": "Finland", "PL": "Poland", "RU": "Russia", "BR": "Brazil",
  "MX": "Mexico", "AR": "Argentina", "CL": "Chile", "CO": "Colombia",
  "IN": "India", "CN": "China", "JP": "Japan", "KR": "South Korea",
  "SG": "Singapore", "HK": "Hong Kong", "TW": "Taiwan", "TH": "Thailand",
  "MY": "Malaysia", "ID": "Indonesia", "PH": "Philippines", "VN": "Vietnam",
  "ZA": "South Africa", "NG": "Nigeria", "KE": "Kenya", "GH": "Ghana",
  "EG": "Egypt", "MA": "Morocco", "IL": "Israel", "AE": "United Arab Emirates",
  "SA": "Saudi Arabia", "TR": "Turkey", "PK": "Pakistan", "BD": "Bangladesh",
  "NZ": "New Zealand", "IE": "Ireland", "PT": "Portugal", "GR": "Greece",
  "CZ": "Czech Republic", "RO": "Romania", "HU": "Hungary", "UA": "Ukraine",
};

// ── Email OSINT ──────────────────────────────────────────────────────────────

async function getMxRecords(domain: string): Promise<Record<string, unknown>> {
  try {
    const records = await dnsPromises.resolveMx(domain);
    return {
      records: records
        .sort((a, b) => a.priority - b.priority)
        .map((r) => ({ priority: r.priority, exchange: r.exchange })),
    };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ESERVFAIL") {
      return { error: "Domain does not exist or has no MX records" };
    }
    return { records: [], note: "No MX records found" };
  }
}

async function getTxtRecords(
  domain: string
): Promise<{ spf: string | null; dmarc: string | null }> {
  const [spfRecords, dmarcRecords] = await Promise.allSettled([
    dnsPromises.resolveTxt(domain),
    dnsPromises.resolveTxt(`_dmarc.${domain}`),
  ]);
  const spf = spfRecords.status === "fulfilled"
    ? (spfRecords.value.map(r => r.join("")).find(r => r.startsWith("v=spf1")) ?? null)
    : null;
  const dmarc = dmarcRecords.status === "fulfilled"
    ? (dmarcRecords.value.map(r => r.join("")).find(r => r.includes("v=DMARC1")) ?? null)
    : null;
  return { spf, dmarc };
}

async function checkGravatar(email: string): Promise<Record<string, unknown>> {
  const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  try {
    const resp = await fetch(`https://www.gravatar.com/avatar/${hash}?d=404`, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const exists = resp.status === 200;
    return {
      exists,
      avatar_url: exists ? `https://www.gravatar.com/avatar/${hash}?s=200` : null,
      profile_url: exists ? `https://gravatar.com/${hash}` : null,
      hash,
    };
  } catch (err: unknown) {
    return { exists: null, error: String(err), hash };
  }
}

async function checkHibp(email: string): Promise<Record<string, unknown>> {
  const apiKey = Netlify.env.get("HIBP_API_KEY") ?? "";
  if (!apiKey) return { configured: false };
  try {
    const resp = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`,
      {
        headers: { "hibp-api-key": apiKey, "User-Agent": "Shebe-OSINT-Tool" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (resp.status === 200) {
      const breaches = (await resp.json()) as Array<Record<string, unknown>>;
      return {
        configured: true,
        breached: true,
        count: breaches.length,
        breaches: breaches.slice(0, 15).map((b) => ({
          name: b["Name"],
          date: b["BreachDate"] ?? "Unknown",
          data_classes: ((b["DataClasses"] as string[]) ?? []).slice(0, 5),
        })),
      };
    } else if (resp.status === 404) {
      return { configured: true, breached: false, count: 0 };
    }
    return { configured: true, error: `API returned ${resp.status}` };
  } catch (err: unknown) {
    return { configured: true, error: String(err) };
  }
}

async function getRdapData(domain: string): Promise<Record<string, unknown>> {
  try {
    const resp = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { error: `RDAP returned ${resp.status}` };
    const data = (await resp.json()) as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    const events = data["events"] as Array<Record<string, string>> | undefined;
    if (events) {
      for (const ev of events) {
        if (ev["eventAction"] === "registration") result["creation_date"] = ev["eventDate"];
        if (ev["eventAction"] === "expiration") result["expiration_date"] = ev["eventDate"];
        if (ev["eventAction"] === "last changed") result["updated_date"] = ev["eventDate"];
      }
    }

    const entities = data["entities"] as Array<Record<string, unknown>> | undefined;
    if (entities) {
      for (const entity of entities) {
        const roles = entity["roles"] as string[] | undefined;
        if (roles?.includes("registrar")) {
          const vcard = entity["vcardArray"] as unknown[][] | undefined;
          if (vcard?.[1]) {
            const fn = (vcard[1] as unknown[][]).find((v) => v[0] === "fn");
            result["registrar"] = fn ? fn[3] : entity["handle"];
          }
        }
      }
    }

    const nameservers = data["nameservers"] as Array<Record<string, string>> | undefined;
    if (nameservers) {
      result["name_servers"] = nameservers
        .map((ns) => ns["ldhName"]?.toLowerCase())
        .filter(Boolean)
        .slice(0, 4);
    }

    return Object.keys(result).length > 0 ? result : { note: "No RDAP data available" };
  } catch (err: unknown) {
    return { error: String(err) };
  }
}

async function gatherEmail(emailInput: string): Promise<Record<string, unknown>> {
  const email = emailInput.toLowerCase().trim();
  if (!EMAIL_RE.test(email)) {
    return { error: `Invalid email format: ${email}`, valid: false };
  }

  const atIdx = email.lastIndexOf("@");
  const username = email.substring(0, atIdx);
  const domain = email.substring(atIdx + 1);
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  const provider = MAJOR_PROVIDERS[domain];
  const isCorporate = !provider && !isDisposable;

  const usernameNotes: string[] = [];
  if (/.*\d{4}$/.test(username)) {
    const year = parseInt(username.slice(-4), 10);
    if (year >= 1950 && year <= 2010) usernameNotes.push(`Username may contain birth year: ${year}`);
  }
  if (/^\d{10}$/.test(username)) usernameNotes.push("Username looks like a phone number");
  if (username.includes(".") || username.includes("_"))
    usernameNotes.push("Username contains separator (firstname.lastname pattern likely)");

  const [mx, txt, gravatar, breach, whoisData, ddg, bing, emailRep] = await Promise.all([
    getMxRecords(domain),
    getTxtRecords(domain),
    checkGravatar(email),
    checkHibp(email),
    isCorporate ? getRdapData(domain) : Promise.resolve({ note: "Skipped for major/known providers" }),
    checkDuckDuckGo(email),
    checkBingSearch(email),
    checkEmailRep(email),
  ]);

  const enc = encodeURIComponent;
  return {
    target: email,
    valid: true,
    username,
    domain,
    provider: provider ?? (isDisposable ? "Disposable/Temporary Email" : "Custom / Corporate Domain"),
    is_disposable: isDisposable,
    is_corporate: isCorporate,
    username_notes: usernameNotes,
    gravatar,
    mx_records: mx,
    txt_records: txt,
    whois: whoisData,
    breach_data: breach,
    email_rep: emailRep,
    web_intel: { ddg, bing },
    search_links: {
      "Google (exact)": `https://www.google.com/search?q="${enc(email)}"`,
      "Bing": `https://www.bing.com/search?q="${enc(email)}"`,
      "Twitter/X": `https://twitter.com/search?q=${enc(email)}`,
      "LinkedIn": `https://www.linkedin.com/search/results/all/?keywords=${enc(email)}`,
      "GitHub Users": `https://github.com/search?q=${enc(email)}&type=users`,
      "Google Dork (Social)": `https://www.google.com/search?q="${enc(email)}"+site:linkedin.com+OR+site:twitter.com+OR+site:github.com`,
      "Google Dork (All)": `https://www.google.com/search?q="${enc(email)}"+OR+"${enc(username)}"`,
      "Google Images": `https://www.google.com/search?q="${enc(email)}"&tbm=isch`,
    },
    username_profile_links: {
      "GitHub": `https://github.com/${username}`,
      "Twitter/X": `https://twitter.com/${username}`,
      "Instagram": `https://instagram.com/${username}`,
      "Reddit": `https://reddit.com/u/${username}`,
      "YouTube": `https://youtube.com/@${username}`,
      "TikTok": `https://tiktok.com/@${username}`,
      "Keybase": `https://keybase.io/${username}`,
    },
  };
}

// ── Phone OSINT ──────────────────────────────────────────────────────────────

const NUMBER_TYPE_MAP: Record<string, string> = {
  FIXED_LINE: "Fixed Line",
  MOBILE: "Mobile",
  FIXED_LINE_OR_MOBILE: "Fixed Line or Mobile",
  TOLL_FREE: "Toll Free",
  PREMIUM_RATE: "Premium Rate",
  SHARED_COST: "Shared Cost",
  VOIP: "VoIP",
  PERSONAL_NUMBER: "Personal Number",
  PAGER: "Pager",
  UAN: "UAN",
  VOICEMAIL: "Voicemail",
};
const HTML_TAG_RE = /<[^>]+>/g;
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function numberTypeToString(type: string | undefined): string {
  return NUMBER_TYPE_MAP[type ?? ""] ?? "Unknown";
}

// ── Extra free live sources ───────────────────────────────────────────────────

// EmailRep.io — free, no key (10 req/day): reputation + linked profiles + first/last seen
async function checkEmailRep(email: string): Promise<Record<string, unknown>> {
  try {
    const resp = await fetch(`https://emailrep.io/${encodeURIComponent(email)}`, {
      headers: { "User-Agent": "shebe-osint/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const data = await resp.json() as Record<string, unknown>;
    const details = (data.details ?? {}) as Record<string, unknown>;
    return {
      reputation:          data.reputation,
      suspicious:          data.suspicious,
      references:          data.references,
      profiles:            details.profiles ?? [],
      first_seen:          details.first_seen ?? null,
      last_seen:           details.last_seen ?? null,
      spam:                details.spam,
      deliverable:         details.deliverable,
      malicious_activity:  details.malicious_activity,
      credentials_leaked:  details.credentials_leaked,
      data_breach:         details.data_breach,
      blacklisted:         details.blacklisted,
      free_provider:       details.free_provider,
    };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "timeout" };
  }
}

// Name analysis — Genderize + Agify + Nationalize (all free, no key, 1000 req/day each)
async function checkNameAnalysis(firstName: string): Promise<Record<string, unknown>> {
  if (!firstName) return {};
  const enc = encodeURIComponent(firstName);
  const [g, a, n] = await Promise.allSettled([
    fetch(`https://api.genderize.io/?name=${enc}`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
    fetch(`https://api.agify.io/?name=${enc}`,    { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
    fetch(`https://api.nationalize.io/?name=${enc}`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
  ]);
  return {
    gender: g.status === "fulfilled" && g.value?.gender ? {
      gender:      String(g.value.gender),
      probability: Math.round(Number(g.value.probability ?? 0) * 100),
      sample_size: g.value.count,
    } : null,
    age: a.status === "fulfilled" && a.value?.age ? {
      predicted_age: a.value.age,
      sample_size:   a.value.count,
    } : null,
    nationalities: n.status === "fulfilled"
      ? (n.value?.country ?? []).slice(0, 5).map((c: Record<string, unknown>) => ({
          code:        String(c.country_id ?? ""),
          name:        COUNTRY_NAMES[String(c.country_id ?? "")] ?? String(c.country_id ?? ""),
          probability: Math.round(Number(c.probability ?? 0) * 100),
        }))
      : [],
  };
}

// ── Web Intelligence (shared across all search types) ────────────────────────

// DuckDuckGo Instant Answer — free, no key needed
async function checkDuckDuckGo(query: string): Promise<Record<string, unknown>> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return { found: false };
    const data = await resp.json() as Record<string, unknown>;

    const abstract = String(data.AbstractText ?? "").trim();
    const answer   = String(data.Answer ?? "").trim();
    const related  = (data.RelatedTopics as Array<Record<string, unknown>> ?? [])
      .filter(t => t.Text && t.FirstURL && !String(t.FirstURL).includes("duckduckgo.com/c/"))
      .slice(0, 6)
      .map(t => ({ text: String(t.Text ?? "").slice(0, 220), url: String(t.FirstURL ?? "") }));

    const infobox = data.Infobox as Record<string, unknown> | null;
    const infoboxContent = infobox?.content as Array<Record<string, unknown>> | undefined;
    const facts = (infoboxContent ?? [])
      .filter(f => f.label && f.value)
      .slice(0, 8)
      .map(f => ({ label: String(f.label), value: String(f.value) }));

    return {
      found: !!(abstract || answer || related.length || facts.length),
      abstract:         abstract || null,
      abstract_source:  String(data.AbstractSource ?? "") || null,
      abstract_url:     String(data.AbstractURL ?? "") || null,
      answer:           answer || null,
      answer_type:      String(data.AnswerType ?? "") || null,
      image:            String(data.Image ?? "") || null,
      related_topics:   related,
      facts,
    };
  } catch {
    return { found: false };
  }
}

// DuckDuckGo HTML scraper — free fallback for real web results (no API key needed)
async function scrapeDuckDuckGoHtml(query: string): Promise<Record<string, unknown>> {
  try {
    const resp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!resp.ok) return { configured: true, source: "ddg", error: `HTTP ${resp.status}`, results: [] };
    const html = await resp.text();

    // Extract URLs: DDG HTML uses redirect links with uddg= param containing the real URL
    const urlRe = /href="\/\/duckduckgo\.com\/l\/\?[^"]*uddg=([^&"]+)[^"]*"[^>]*class="result__a"[^>]*>|class="result__a"[^>]*href="\/\/duckduckgo\.com\/l\/\?[^"]*uddg=([^&"]+)[^"]*"[^>]*>/gi;
    const titleRe = /class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const urls: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(html)) !== null) {
      const encoded = m[1] || m[2];
      if (encoded) {
        try { urls.push(decodeURIComponent(encoded)); } catch { /* skip */ }
      }
    }

    const titles: string[] = [];
    while ((m = titleRe.exec(html)) !== null) {
      const t = m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
      if (t) titles.push(t);
    }

    const snippets: string[] = [];
    while ((m = snippetRe.exec(html)) !== null) {
      const s = m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
      if (s) snippets.push(s);
    }

    const results: Array<Record<string, unknown>> = [];
    for (let i = 0; i < Math.min(titles.length, 6); i++) {
      const url = urls[i] ?? "";
      let displayUrl = url;
      try { displayUrl = new URL(url).hostname; } catch { /* keep raw */ }
      results.push({ title: titles[i], url, display_url: displayUrl, snippet: snippets[i] ?? "" });
    }

    return { configured: true, source: "ddg", results, total_estimated: null };
  } catch (e: unknown) {
    return { configured: true, source: "ddg", error: e instanceof Error ? e.message : "failed", results: [] };
  }
}

// Bing Web Search — real web snippets (needs BING_SEARCH_API_KEY, free: 1000 req/month)
// Falls back to DuckDuckGo HTML scraping when key is not set.
async function checkBingSearch(query: string): Promise<Record<string, unknown>> {
  const apiKey = Netlify.env.get("BING_SEARCH_API_KEY");
  if (!apiKey) return scrapeDuckDuckGoHtml(query);

  try {
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=6&textDecorations=false&safeSearch=Off`;
    const resp = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return { configured: true, error: `HTTP ${resp.status}` };
    const data = await resp.json() as Record<string, unknown>;
    const pages = data.webPages as Record<string, unknown> | undefined;
    const results = (pages?.value as Array<Record<string, unknown>> ?? []).map(p => ({
      title:       String(p.name ?? ""),
      snippet:     String(p.snippet ?? "").slice(0, 300),
      url:         String(p.url ?? ""),
      display_url: String(p.displayUrl ?? ""),
      date:        String(p.dateLastCrawled ?? "").slice(0, 10) || null,
    }));
    const news = data.news as Record<string, unknown> | undefined;
    const newsResults = (news?.value as Array<Record<string, unknown>> ?? []).slice(0, 3).map(n => ({
      title:       String(n.name ?? ""),
      description: String(n.description ?? "").slice(0, 200),
      url:         String(n.url ?? ""),
      published:   String(n.datePublished ?? "").slice(0, 10) || null,
      provider:    String((n.provider as Array<Record<string,unknown>>)?.[0]?.name ?? ""),
    }));
    return {
      configured: true,
      results,
      news_results: newsResults,
      total_estimated: Number(pages?.totalEstimatedMatches ?? 0),
    };
  } catch (e: unknown) {
    return { configured: true, error: e instanceof Error ? e.message : "timeout" };
  }
}

// ── Reverse Phone Lookup ─────────────────────────────────────────────────────

// Twilio Lookup v2 — caller name + live line intelligence (needs TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN)
async function checkReversePhone(e164: string): Promise<Record<string, unknown>> {
  const accountSid = Netlify.env.get("TWILIO_ACCOUNT_SID");
  const authToken  = Netlify.env.get("TWILIO_AUTH_TOKEN");
  if (!accountSid || !authToken) return { configured: false };

  try {
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=caller_name,line_type_intelligence`;
    const resp = await fetch(url, {
      headers: { "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`) },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as Record<string, unknown>;
      return { configured: true, error: String(body.message ?? `HTTP ${resp.status}`) };
    }
    const data = await resp.json() as Record<string, unknown>;
    const cn  = data.caller_name as Record<string, unknown> | null;
    const lti = data.line_type_intelligence as Record<string, unknown> | null;
    return {
      configured: true,
      caller_name:        cn?.caller_name  ?? null,
      caller_type:        cn?.caller_type  ?? null,   // "CONSUMER" | "BUSINESS"
      caller_error_code:  cn?.error_code   ?? null,
      carrier_name:       lti?.carrier_name             ?? null,
      line_type:          lti?.type                     ?? null,
      mobile_country_code: lti?.mobile_country_code     ?? null,
      mobile_network_code: lti?.mobile_network_code     ?? null,
    };
  } catch (e: unknown) {
    return { configured: true, error: e instanceof Error ? e.message : String(e) };
  }
}

// NumVerify (apilayer) — carrier + location enrichment (needs NUMVERIFY_API_KEY, free: 250/mo)
async function checkNumVerify(phone: string): Promise<Record<string, unknown>> {
  const apiKey = Netlify.env.get("NUMVERIFY_API_KEY");
  if (!apiKey) return { configured: false };

  try {
    const url = `https://apilayer.net/api/validate?access_key=${encodeURIComponent(apiKey)}&number=${encodeURIComponent(phone)}&format=1`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return { configured: true, error: `HTTP ${resp.status}` };
    const data = await resp.json() as Record<string, unknown>;
    const apiErr = data.error as Record<string, unknown> | undefined;
    if (apiErr) return { configured: true, error: String(apiErr.info ?? "API error") };
    return {
      configured: true,
      valid:                data.valid,
      location:             data.location,
      carrier:              data.carrier,
      line_type:            data.line_type,
      country_name:         data.country_name,
      international_format: data.international_format,
    };
  } catch (e: unknown) {
    return { configured: true, error: e instanceof Error ? e.message : String(e) };
  }
}

// Handle partial/wildcard phone numbers where unknown digits are represented as *
async function gatherPartialPhone(rawInput: string): Promise<Record<string, unknown>> {
  const input = rawInput.trim();

  // Replace wildcards with 0 so libphonenumber can detect country/format
  const forParsing = input.replace(/\*/g, "0");
  let parsed = null;
  for (const attempt of [forParsing, "+" + forParsing.replace(/^\+/, ""), forParsing.replace(/[\s\-()\+]/g, "")]) {
    try { const p = parsePhoneNumber(attempt); if (p) { parsed = p; break; } } catch {}
  }

  if (!parsed) {
    return {
      error: "Could not determine country from partial number. Include the country code prefix (e.g. +254 0712 *** 456 for Kenya, +234 0812 *** 456 for Nigeria).",
      valid: false, partial: true, target: input,
    };
  }

  const regionCode = parsed.country ?? "";
  const countryCallingCode = String(parsed.countryCallingCode);
  const countryName = COUNTRY_NAMES[regionCode] ?? regionCode;
  const timezones = COUNTRY_TIMEZONES[regionCode] ?? [];

  // Extract national pattern keeping * wildcards
  const cleanOriginal = input.replace(/[\s\-()\+]/g, ""); // strip formatting, keep *
  const withoutCC = cleanOriginal.startsWith(countryCallingCode)
    ? cleanOriginal.slice(countryCallingCode.length)
    : cleanOriginal;

  // Carrier detection from the known prefix digits
  let carrierGuess = "Unknown";
  const info = CARRIER_PREFIXES[regionCode];
  if (info && withoutCC) {
    const local = withoutCC.startsWith("0") ? withoutCC : `0${withoutCC}`;
    const firstWild = local.indexOf("*");
    const knownPrefix = firstWild === -1 ? local : local.slice(0, firstWild);

    if (knownPrefix.length >= info.len) {
      carrierGuess = info.map[knownPrefix.slice(0, info.len)] ?? "Unknown";
    } else if (knownPrefix.length > 0) {
      const matches = [...new Set(
        Object.entries(info.map)
          .filter(([k]) => k.startsWith(knownPrefix))
          .map(([, v]) => v)
      )];
      carrierGuess = matches.length === 1
        ? matches[0]
        : matches.length > 1 ? `Possibly: ${matches.join(" / ")}` : "Unknown";
    }
  }

  const wildcardCount = (input.match(/\*/g) ?? []).length;
  const knownDigitsOnly = input.replace(/[^+\d]/g, "");
  const enc = encodeURIComponent;

  const searchLinks: Record<string, string> = {
    "Google (number pattern)": `https://www.google.com/search?q=${enc(input)}`,
    "Google (known digits only)": `https://www.google.com/search?q="${knownDigitsOnly}"`,
    "Bing": `https://www.bing.com/search?q=${enc(input)}`,
    "Truecaller (known digits)": `https://www.truecaller.com/search/${regionCode.toLowerCase()}/${withoutCC.replace(/\*/g, "")}`,
    "SpyDialer (known digits)": `https://www.spydialer.com/default.aspx?ph=${withoutCC.replace(/\*/g, "")}`,
  };

  if (["KE", "NG", "ZA", "GH", "UG", "TZ"].includes(regionCode)) {
    searchLinks["Google Dork (M-Pesa/Paybill)"] = `https://www.google.com/search?q=${enc(input)}+mpesa+OR+paybill+OR+till`;
    searchLinks["Jiji (classifieds, known digits)"] = `https://jiji.co.ke/search?query=${enc(withoutCC.replace(/\*/g, ""))}`;
  }

  const notes: string[] = [
    `Partial/wildcard search — ${wildcardCount} unknown digit${wildcardCount !== 1 ? "s" : ""} (replaced by * in input).`,
    "Country and carrier derived from the known prefix digits.",
    wildcardCount > 4
      ? "Many unknown digits — search links use only the known portion and may return broad results."
      : "Search links use known digits; a full number is needed for exact reverse-lookup.",
  ];

  return {
    target: input,
    partial: true,
    valid: false,
    possible: true,
    country_code: `+${countryCallingCode}`,
    region_code: regionCode,
    country_name: countryName,
    national_number: withoutCC,
    location: countryName || "Unknown",
    carrier: carrierGuess,
    line_type: "Unknown (partial number)",
    timezones,
    formats: {
      "Input Pattern": input,
      "Known Digits": knownDigitsOnly,
      "National Pattern": withoutCC,
    },
    notes,
    search_links: searchLinks,
  };
}

async function gatherPhone(phoneInput: string): Promise<Record<string, unknown>> {
  const phone = phoneInput.trim();
  // Delegate to partial handler when wildcards are present
  if (phone.includes("*")) return gatherPartialPhone(phone);
  let parsed = null;
  for (const attempt of [phone, "+" + phone.replace(/^\+/, ""), phone.replace(/[\s\-()\+]/g, "")]) {
    try {
      const p = parsePhoneNumber(attempt);
      if (p) { parsed = p; break; }
    } catch {}
  }

  if (!parsed) {
    return {
      error: "Could not parse phone number. Please use international format (e.g. +14155552671)",
      valid: false,
      target: phone,
    };
  }

  const isValid = parsed.isValid();
  const isPossible = parsed.isPossible();
  const formats: Record<string, string> = {};
  for (const fmt of ["E.164", "INTERNATIONAL", "NATIONAL", "RFC3966"] as const) {
    try { formats[fmt] = parsed.format(fmt); } catch {}
  }

  const lineType = numberTypeToString(parsed.getType());
  const regionCode = parsed.country ?? "";
  const countryName = COUNTRY_NAMES[regionCode] ?? regionCode;
  const e164 = formats["E.164"] ?? `+${parsed.countryCallingCode}${parsed.nationalNumber}`;
  const numberDigits = e164.replace("+", "");
  const nationalClean = (formats["NATIONAL"] ?? "").replace(/[\s\-()\+]/g, "");

  const notes: string[] = [];
  if (!isValid) notes.push("This number appears to be invalid or unassigned.");
  if (lineType === "VoIP") notes.push("VoIP number — may not correspond to a physical location.");
  if (lineType === "Mobile") notes.push("Mobile number — carrier may provide approximate location info.");
  if (lineType === "Toll Free") notes.push("Toll-free number — typically a business line.");

  const carrier = getCarrier(String(parsed.nationalNumber), regionCode);
  const timezones: string[] = COUNTRY_TIMEZONES[regionCode] ?? [];

  const searchLinks: Record<string, string> = {
    "Google (exact)": `https://www.google.com/search?q="${e164}"`,
    "Google (national)": `https://www.google.com/search?q="${formats["NATIONAL"] ?? ""}"`,
    "Google Dork": `https://www.google.com/search?q="${e164}"+OR+"${formats["NATIONAL"] ?? ""}"`,
    "Bing": `https://www.bing.com/search?q="${e164}"`,
    "Truecaller": `https://www.truecaller.com/search/${regionCode.toLowerCase()}/${nationalClean}`,
    "SpyDialer": `https://www.spydialer.com/default.aspx?ph=${nationalClean}`,
    "WhoCallsMe": `https://www.whocalledus.com/number/${numberDigits}`,
  };

  if (["KE", "NG", "ZA", "GH", "UG", "TZ"].includes(regionCode)) {
    searchLinks["Jiji (classifieds)"] = `https://jiji.co.ke/search?query=${encodeURIComponent(nationalClean)}`;
    searchLinks["Facebook (number search)"] = `https://www.facebook.com/search/top?q=${encodeURIComponent(e164)}`;
    searchLinks["Google Dork (M-Pesa/Paybill)"] = `https://www.google.com/search?q="${nationalClean}"+OR+"${e164}"+mpesa+OR+paybill+OR+till`;
  }

  return {
    target: phone,
    valid: isValid,
    possible: isPossible,
    country_code: `+${parsed.countryCallingCode}`,
    region_code: regionCode,
    country_name: countryName,
    national_number: String(parsed.nationalNumber),
    location: countryName || "Unknown",
    carrier,
    line_type: lineType,
    timezones,
    formats,
    notes,
    search_links: searchLinks,
    communication_links: {
      "WhatsApp": `https://wa.me/${numberDigits}`,
      "Telegram": `https://t.me/+${numberDigits}`,
      "Signal (click to open app)": `https://signal.me/#p/${e164}`,
    },
    ...await (async () => {
      const [reverse_lookup, numverify, ddg, bing] = await Promise.all([
        checkReversePhone(e164),
        checkNumVerify(e164),
        checkDuckDuckGo(e164),
        checkBingSearch(e164),
      ]);
      return { reverse_lookup, numverify, web_intel: { ddg, bing } };
    })(),
  };
}

// ── Name OSINT ───────────────────────────────────────────────────────────────

function parseName(name: string) {
  const parts = name.trim().split(/\s+/);
  return {
    full: name.trim(),
    first: parts[0] ?? "",
    last: parts.length > 1 ? parts[parts.length - 1] : "",
    middle: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    word_count: parts.length,
  };
}

function generateUsernames(parts: ReturnType<typeof parseName>): string[] {
  const firstA = parts.first.toLowerCase().replace(/[^a-z]/g, "");
  const lastA = parts.last.toLowerCase().replace(/[^a-z]/g, "");
  const fiA = firstA[0] ?? "";
  const liA = lastA[0] ?? "";
  const mi = parts.middle ? parts.middle.toLowerCase()[0] : "";

  const candidates: string[] = [];
  if (firstA && lastA) {
    candidates.push(
      `${firstA}${lastA}`, `${firstA}.${lastA}`, `${firstA}_${lastA}`,
      `${firstA}-${lastA}`, `${fiA}${lastA}`, `${fiA}.${lastA}`,
      `${fiA}_${lastA}`, `${firstA}${liA}`, `${lastA}${firstA}`,
      `${lastA}.${firstA}`, `${lastA}_${firstA}`, `${lastA}${fiA}`,
      `${firstA}${lastA}1`, `${firstA}${lastA}2`, `${firstA}_${lastA}_`,
    );
    if (mi) candidates.push(`${firstA}${mi}${lastA}`, `${firstA}.${mi}.${lastA}`, `${fiA}${mi}${lastA}`);
  } else if (firstA) {
    candidates.push(firstA);
  }
  return [...new Set(candidates)];
}

async function checkGithub(usernames: string[]): Promise<Record<string, unknown>[]> {
  const settled = await Promise.allSettled(
    usernames.slice(0, 8).map(async (username) => {
      const resp = await fetch(`https://api.github.com/users/${username}`, {
        headers: { Accept: "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 200) {
        const d = (await resp.json()) as Record<string, unknown>;
        return {
          username, found: true,
          name: d["name"], bio: d["bio"], location: d["location"], company: d["company"],
          public_repos: d["public_repos"], followers: d["followers"],
          url: d["html_url"], avatar: d["avatar_url"],
          created_at: d["created_at"], blog: d["blog"],
          email: d["email"], twitter: d["twitter_username"],
        };
      }
      return { username, found: false };
    })
  );
  return settled.map((r) =>
    r.status === "fulfilled" ? r.value : { username: "unknown", found: null, error: "Request failed" }
  );
}

async function checkReddit(usernames: string[]): Promise<Record<string, unknown>[]> {
  const settled = await Promise.allSettled(
    usernames.slice(0, 6).map(async (username) => {
      const resp = await fetch(`https://www.reddit.com/user/${username}/about.json`, {
        headers: { "User-Agent": "OSINT-Report-Tool/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 200) {
        const d = (await resp.json()) as { data?: Record<string, unknown> };
        const data = d.data ?? {};
        if (!data["name"]) return { username, found: false };
        return {
          username, found: true,
          karma: ((data["link_karma"] as number) ?? 0) + ((data["comment_karma"] as number) ?? 0),
          link_karma: data["link_karma"],
          comment_karma: data["comment_karma"],
          created_utc: data["created_utc"],
          is_gold: data["is_gold"],
          url: `https://reddit.com/u/${username}`,
        };
      }
      return { username, found: false };
    })
  );
  return settled.map((r) =>
    r.status === "fulfilled" ? r.value : { username: "unknown", found: null, error: "Request failed" }
  );
}

async function checkKeybase(usernames: string[]): Promise<Record<string, unknown>[]> {
  const settled = await Promise.allSettled(
    usernames.slice(0, 6).map(async (username) => {
      const resp = await fetch(
        `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${username}&fields=basics,profile`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (resp.status === 200) {
        const d = (await resp.json()) as { them?: Array<Record<string, unknown> | null> };
        const them = d.them?.[0];
        if (them && (them["id"] || them["basics"])) {
          const basics = them["basics"] as Record<string, unknown> | undefined;
          const profile = them["profile"] as Record<string, unknown> | undefined;
          return {
            username, found: true,
            display_name: basics?.["username_cased"] ?? username,
            full_name: profile?.["full_name"],
            bio: profile?.["bio"],
            location: profile?.["location"],
            url: `https://keybase.io/${username}`,
          };
        }
      }
      return { username, found: false };
    })
  );
  return settled.map((r) =>
    r.status === "fulfilled" ? r.value : { username: "unknown", found: null, error: "Request failed" }
  );
}

async function checkDevTo(usernames: string[]): Promise<Record<string, unknown>[]> {
  const settled = await Promise.allSettled(
    usernames.slice(0, 6).map(async (username) => {
      const resp = await fetch(`https://dev.to/api/users/by_username?url=${username}`, {
        headers: { "User-Agent": "OSINT-Report-Tool/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 200) {
        const d = (await resp.json()) as Record<string, unknown>;
        return {
          username, found: true,
          name: d["name"],
          summary: d["summary"],
          location: d["location"],
          twitter_username: d["twitter_username"],
          github_username: d["github_username"],
          website_url: d["website_url"],
          profile_image: d["profile_image_90"],
          url: `https://dev.to/${username}`,
        };
      }
      return { username, found: false };
    })
  );
  return settled.map((r) =>
    r.status === "fulfilled" ? r.value : { username: "unknown", found: null, error: "Request failed" }
  );
}

async function searchMastodon(username: string): Promise<Record<string, unknown>[]> {
  try {
    const resp = await fetch(
      `https://mastodon.social/api/v1/accounts/search?q=${encodeURIComponent(username)}&limit=5&resolve=false`,
      {
        headers: { "User-Agent": "OSINT-Report-Tool/1.0" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!resp.ok) return [];
    const accounts = (await resp.json()) as Array<Record<string, unknown>>;
    return accounts.map((a) => ({
      username: a["username"],
      display_name: a["display_name"],
      bio: String(a["note"] ?? "").replace(HTML_TAG_RE, "").slice(0, 200),
      url: a["url"],
      followers: a["followers_count"],
      statuses: a["statuses_count"],
      avatar: a["avatar"],
      found: true,
    }));
  } catch {
    return [];
  }
}

async function searchWikipedia(query: string): Promise<Record<string, unknown>> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return { results: [], error: `Wikipedia returned ${resp.status}` };
    const d = (await resp.json()) as { query?: { search?: Array<Record<string, unknown>> } };
    const results = (d.query?.search ?? []).map((r) => ({
      title: r["title"],
      snippet: String(r["snippet"] ?? "").replace(HTML_TAG_RE, "").slice(0, 200),
      pageid: r["pageid"],
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(r["title"] ?? "").replace(/ /g, "_"))}`,
    }));
    return { results };
  } catch (err: unknown) {
    return { results: [], error: String(err) };
  }
}

async function gatherName(nameInput: string): Promise<Record<string, unknown>> {
  const name = nameInput.trim();
  if (!name || name.length < 2) return { error: "Name must be at least 2 characters", valid: false };

  const parts = parseName(name);
  const usernames = generateUsernames(parts);

  const [githubResults, redditResults, keybaseResults, devtoResults, mastodonResults, wikipedia, ddg, bing, nameAnalysis] = await Promise.all([
    checkGithub(usernames),
    checkReddit(usernames),
    checkKeybase(usernames),
    checkDevTo(usernames),
    searchMastodon(parts.first || name),
    searchWikipedia(name),
    checkDuckDuckGo(name),
    checkBingSearch(name),
    checkNameAnalysis(parts.first || name),
  ]);

  const foundCount = githubResults.filter((r) => r["found"] === true).length;
  const redditFoundCount = redditResults.filter((r) => r["found"] === true).length;
  const keybaseFoundCount = keybaseResults.filter((r) => r["found"] === true).length;
  const devtoFoundCount = devtoResults.filter((r) => r["found"] === true).length;
  const mastodonFoundCount = mastodonResults.length;
  const wikiHits = ((wikipedia["results"] as unknown[]) ?? []).length;

  const enc = encodeURIComponent;
  const encodedFull = enc(`"${name}"`);
  const encodedName = enc(name);

  const usernameLinks: Record<string, Record<string, string>> = {};
  for (const un of usernames.slice(0, 10)) {
    usernameLinks[un] = {
      "GitHub": `https://github.com/${un}`,
      "Twitter/X": `https://twitter.com/${un}`,
      "Instagram": `https://instagram.com/${un}`,
      "Reddit": `https://reddit.com/u/${un}`,
      "TikTok": `https://tiktok.com/@${un}`,
      "YouTube": `https://youtube.com/@${un}`,
      "LinkedIn": `https://linkedin.com/in/${un}`,
      "Pinterest": `https://pinterest.com/${un}`,
      "Tumblr": `https://${un}.tumblr.com`,
      "Keybase": `https://keybase.io/${un}`,
      "DEV.to": `https://dev.to/${un}`,
      "Mastodon": `https://mastodon.social/@${un}`,
      "Twitch": `https://twitch.tv/${un}`,
      "Medium": `https://medium.com/@${un}`,
    };
  }

  return {
    target: name,
    valid: true,
    name_parts: parts,
    possible_usernames: usernames,
    key_findings: {
      github_found: foundCount,
      reddit_found: redditFoundCount,
      keybase_found: keybaseFoundCount,
      devto_found: devtoFoundCount,
      mastodon_found: mastodonFoundCount,
      wikipedia_hits: wikiHits,
      usernames_checked: usernames.length,
    },
    github_profiles: githubResults,
    github_found_count: foundCount,
    reddit_profiles: redditResults,
    reddit_found_count: redditFoundCount,
    keybase_profiles: keybaseResults,
    keybase_found_count: keybaseFoundCount,
    devto_profiles: devtoResults,
    devto_found_count: devtoFoundCount,
    mastodon_accounts: mastodonResults,
    mastodon_found_count: mastodonFoundCount,
    wikipedia,
    name_analysis: nameAnalysis,
    web_intel: { ddg, bing },
    search_links: {
      "Google (full name)": `https://www.google.com/search?q=${encodedFull}`,
      "Google News": `https://www.google.com/search?q=${encodedFull}&tbm=nws`,
      "Google Images": `https://www.google.com/search?q=${encodedFull}&tbm=isch`,
      "Bing": `https://www.bing.com/search?q=${encodedFull}`,
      "LinkedIn People": `https://www.linkedin.com/search/results/people/?keywords=${encodedName}`,
      "Twitter/X People": `https://twitter.com/search?q=${encodedFull}&f=user`,
      "Facebook People": `https://www.facebook.com/search/people/?q=${encodedName}`,
      "Instagram": `https://www.instagram.com/explore/search/keyword/?q=${encodedName}`,
      "GitHub Users": `https://github.com/search?q=${encodedFull}&type=users`,
      "Reddit Users": `https://www.reddit.com/search/?q=${encodedFull}&type=user`,
      "TikTok": `https://www.tiktok.com/search/user?q=${encodedName}`,
      "YouTube": `https://www.youtube.com/results?search_query=${encodedFull}`,
      "Pipl": `https://pipl.com/search/?q=${encodedName}`,
      "Spokeo": `https://www.spokeo.com/${enc(name.replace(/ /g, "-"))}`,
      "BrighterMonday (East Africa jobs/CVs)": `https://www.brightermonday.co.ke/jobs?q=${encodedName}`,
      "Jiji (Africa marketplace)": `https://jiji.co.ke/search?query=${encodedName}`,
      "M-Changa (Kenya fundraising)": `https://www.mchanga.africa/search?q=${encodedName}`,
      "Yellow Pages Kenya": `https://yellowpages.co.ke/search?q=${encodedName}`,
      "PigiaMe Kenya (classifieds)": `https://www.pigiame.co.ke/search?q=${encodedName}`,
      "Kenya BRS (business registry)": `https://efts.ecitizen.go.ke/index.php?r=registry/search&query=${encodedName}`,
      "CAC Nigeria (company search)": `https://search.cac.gov.ng/home`,
      "CIPC South Africa (company search)": `https://iportal.cipc.co.za/`,
      "Kenya Judiciary (court records)": `https://www.judiciary.go.ke/portal/`,
    },
    google_dorks: {
      "Full name (exact)": `https://www.google.com/search?q=${encodedFull}`,
      "LinkedIn profile": `https://www.google.com/search?q=site:linkedin.com+${encodedFull}`,
      "Facebook profile": `https://www.google.com/search?q=site:facebook.com+${encodedFull}`,
      "Twitter/X profile": `https://www.google.com/search?q=site:twitter.com+${encodedFull}`,
      "Instagram profile": `https://www.google.com/search?q=site:instagram.com+${encodedFull}`,
      "GitHub profile": `https://www.google.com/search?q=site:github.com+${encodedFull}`,
      "News articles": `https://www.google.com/search?q=${encodedFull}+site:news.google.com+OR+site:reuters.com+OR+site:bbc.com`,
      "Email addresses": `https://www.google.com/search?q=${encodedFull}+%40gmail.com+OR+%40yahoo.com+OR+%40outlook.com`,
      "Phone numbers": `https://www.google.com/search?q=${encodedFull}+phone+OR+tel+OR+mobile`,
      "Social (all)": `https://www.google.com/search?q=${encodedFull}+site:linkedin.com+OR+site:facebook.com+OR+site:twitter.com+OR+site:instagram.com`,
      "Kenyan news (Tuko, Standard, Nation, Citizen)": `https://www.google.com/search?q=${encodedFull}+site:tuko.co.ke+OR+site:standardmedia.co.ke+OR+site:nation.africa+OR+site:citizen.digital`,
      "Kenya BRS business registry": `https://www.google.com/search?q=${enc(`site:efts.ecitizen.go.ke ${name}`)}`,
      "CAC Nigeria company search": `https://www.google.com/search?q=${enc(`site:search.cac.gov.ng ${name}`)}`,
      "Kenya Judiciary court records": `https://www.google.com/search?q=${enc(`site:judiciary.go.ke ${name}`)}`,
      "African business records": `https://www.google.com/search?q=${encodedFull}+site:opencorporates.com+OR+site:brs.go.ke`,
      "Yellow Pages & directories": `https://www.google.com/search?q=${encodedFull}+site:yellowpages.co.ke+OR+site:pigiame.co.ke`,
    },
    username_profile_links: usernameLinks,
  };
}

// ── Hybrid OSINT ─────────────────────────────────────────────────────────────

async function gatherHybrid(input: { name?: string; email?: string; phone?: string }): Promise<Record<string, unknown>> {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  const phone = (input.phone ?? "").trim();

  if (!name && !email && !phone) {
    return { error: "Provide at least one of: name, email, phone", valid: false };
  }

  const [nameResult, emailResult, phoneResult] = await Promise.all([
    name ? gatherName(name) : Promise.resolve(null),
    email ? gatherEmail(email) : Promise.resolve(null),
    phone ? gatherPhone(phone) : Promise.resolve(null),
  ]);

  const enc = encodeURIComponent;
  const terms: string[] = [];
  if (name) terms.push(`"${name}"`);
  if (email) terms.push(`"${email}"`);
  if (phone) {
    const e164 = (phoneResult?.["formats"] as Record<string, string> | undefined)?.["E.164"] ?? phone;
    terms.push(`"${e164}"`);
  }

  const crossSearchLinks: Record<string, string> = {};
  const crossDorks: Record<string, string> = {};

  if (terms.length >= 2) {
    const combinedOr = terms.join(" OR ");
    const combinedAnd = terms.join(" ");
    crossSearchLinks["Google (any match)"] = `https://www.google.com/search?q=${enc(combinedOr)}`;
    crossSearchLinks["Google (all terms)"] = `https://www.google.com/search?q=${enc(combinedAnd)}`;
    crossSearchLinks["Bing (all terms)"] = `https://www.bing.com/search?q=${enc(combinedAnd)}`;
    crossDorks["LinkedIn (all terms)"] = `https://www.google.com/search?q=${enc(`site:linkedin.com ${combinedAnd}`)}`;
    crossDorks["Facebook (all terms)"] = `https://www.google.com/search?q=${enc(`site:facebook.com ${combinedAnd}`)}`;
    crossDorks["Social profiles (any term)"] = `https://www.google.com/search?q=${enc(`(${combinedOr}) (site:linkedin.com OR site:facebook.com OR site:twitter.com OR site:instagram.com)`)}`;
  }

  if (name && phone) {
    const e164 = (phoneResult?.["formats"] as Record<string, string> | undefined)?.["E.164"] ?? phone;
    crossDorks["Name + Phone (M-Pesa/Paybill)"] = `https://www.google.com/search?q=${enc(`"${name}" "${e164}" (mpesa OR paybill OR till)`)}`;
  }
  if (name && email) {
    crossDorks["Name + Email"] = `https://www.google.com/search?q=${enc(`"${name}" "${email}"`)}`;
  }
  if (email && phone) {
    const e164 = (phoneResult?.["formats"] as Record<string, string> | undefined)?.["E.164"] ?? phone;
    crossDorks["Email + Phone"] = `https://www.google.com/search?q=${enc(`"${email}" "${e164}"`)}`;
  }

  // Confidence: how many independent identifiers agree on key signals
  const matchSignals: string[] = [];
  if (name && email) matchSignals.push("Name and email both provided — cross-check social profiles for matching identity");
  if (name && phone) matchSignals.push("Name and phone both provided — cross-check messaging apps and classifieds for matching identity");
  if (email && phone) matchSignals.push("Email and phone both provided — look for accounts that expose both (e.g. marketplace listings)");
  if (name && email && phone) matchSignals.push("All three identifiers provided — highest accuracy; prioritize sources that corroborate all three");

  return {
    target: { name: name || null, email: email || null, phone: phone || null },
    valid: true,
    name: nameResult,
    email: emailResult,
    phone: phoneResult,
    cross_reference: {
      identifiers_used: terms.length,
      notes: matchSignals,
      search_links: crossSearchLinks,
      google_dorks: crossDorks,
    },
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let data: { type?: string; query?: string; name?: string; email?: string; phone?: string };
  try {
    data = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Request body must be JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const queryType = (data.type ?? "").toLowerCase().trim();

  if (!["email", "phone", "name", "hybrid"].includes(queryType)) {
    return new Response(JSON.stringify({ error: "type must be one of: email, phone, name, hybrid" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let result: Record<string, unknown>;
  let query: string;

  if (queryType === "hybrid") {
    const name = (data.name ?? "").trim();
    const email = (data.email ?? "").trim();
    const phone = (data.phone ?? "").trim();
    if (!name && !email && !phone) {
      return new Response(JSON.stringify({ error: "Provide at least one of: name, email, phone" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    query = [name, email, phone].filter(Boolean).join(" / ");
    result = await gatherHybrid({ name, email, phone });
  } else {
    query = (data.query ?? "").trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "Search query is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (queryType === "email") result = await gatherEmail(query);
    else if (queryType === "phone") result = await gatherPhone(query);
    else result = await gatherName(query);
  }

  result["meta"] = {
    generated_at: new Date().toISOString(),
    query_type: queryType,
    query,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/search",
};
