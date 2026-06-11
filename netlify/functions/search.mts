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

const KENYA_MOBILE_PREFIXES: Record<string, string> = {
  "0700": "Safaricom", "0701": "Safaricom", "0702": "Safaricom", "0703": "Safaricom",
  "0704": "Safaricom", "0705": "Safaricom", "0706": "Safaricom", "0707": "Safaricom",
  "0708": "Safaricom", "0709": "Safaricom", "0710": "Safaricom", "0711": "Safaricom",
  "0712": "Safaricom", "0713": "Safaricom", "0714": "Safaricom", "0715": "Safaricom",
  "0716": "Safaricom", "0717": "Safaricom", "0718": "Safaricom", "0719": "Safaricom",
  "0720": "Safaricom", "0721": "Safaricom", "0722": "Safaricom", "0723": "Safaricom",
  "0724": "Safaricom", "0725": "Safaricom", "0726": "Safaricom", "0727": "Safaricom",
  "0728": "Safaricom", "0729": "Safaricom",
  "0740": "Airtel Kenya", "0750": "Airtel Kenya", "0741": "Airtel Kenya",
  "0742": "Airtel Kenya", "0743": "Airtel Kenya", "0746": "Airtel Kenya",
  "0775": "Airtel Kenya", "0786": "Airtel Kenya", "0787": "Airtel Kenya",
  "0789": "Airtel Kenya",
  "0730": "Equitel", "0731": "Equitel", "0732": "Equitel",
  "0747": "Telkom Kenya", "0748": "Telkom Kenya", "0749": "Telkom Kenya",
  "0776": "Telkom Kenya", "0777": "Telkom Kenya", "0778": "Telkom Kenya",
  "0779": "Telkom Kenya",
  "0747000": "Faiba (Jamii Telecom)",
};

function getKenyaCarrier(nationalNumber: string): string {
  const local = nationalNumber.startsWith("0") ? nationalNumber : `0${nationalNumber}`;
  const prefix = local.slice(0, 4);
  return KENYA_MOBILE_PREFIXES[prefix] ?? "Unknown";
}

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
  let spf: string | null = null;
  let dmarc: string | null = null;
  try {
    const records = await dnsPromises.resolveTxt(domain);
    for (const record of records) {
      const rdata = record.join("");
      if (rdata.startsWith("v=spf1")) spf = rdata;
    }
  } catch {}
  try {
    const dmarcRecords = await dnsPromises.resolveTxt(`_dmarc.${domain}`);
    for (const record of dmarcRecords) {
      const rdata = record.join("");
      if (rdata.includes("v=DMARC1")) dmarc = rdata;
    }
  } catch {}
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
  if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
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

  const [mx, txt, gravatar, breach, whoisData] = await Promise.all([
    getMxRecords(domain),
    getTxtRecords(domain),
    checkGravatar(email),
    checkHibp(email),
    isCorporate ? getRdapData(domain) : Promise.resolve({ note: "Skipped for major/known providers" }),
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

function numberTypeToString(type: string | undefined): string {
  const map: Record<string, string> = {
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
  return map[type ?? ""] ?? "Unknown";
}

async function gatherPhone(phoneInput: string): Promise<Record<string, unknown>> {
  const phone = phoneInput.trim();
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

  const carrier = regionCode === "KE" ? getKenyaCarrier(String(parsed.nationalNumber)) : "Unknown";

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
    timezones: [],
    formats,
    notes,
    search_links: searchLinks,
    communication_links: {
      "WhatsApp": `https://wa.me/${numberDigits}`,
      "Telegram": `https://t.me/+${numberDigits}`,
      "Signal (click to open app)": `https://signal.me/#p/${e164}`,
    },
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

async function gatherName(nameInput: string): Promise<Record<string, unknown>> {
  const name = nameInput.trim();
  if (!name || name.length < 2) return { error: "Name must be at least 2 characters", valid: false };

  const parts = parseName(name);
  const usernames = generateUsernames(parts);
  const githubResults = await checkGithub(usernames);
  const foundCount = githubResults.filter((r) => r["found"] === true).length;

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
      "Twitch": `https://twitch.tv/${un}`,
      "Medium": `https://medium.com/@${un}`,
    };
  }

  return {
    target: name,
    valid: true,
    name_parts: parts,
    possible_usernames: usernames,
    github_profiles: githubResults,
    github_found_count: foundCount,
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
      "African business records": `https://www.google.com/search?q=${encodedFull}+site:opencorporates.com+OR+site:brs.go.ke`,
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
