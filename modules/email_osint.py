import re
import hashlib
import requests
import os

try:
    import whois as python_whois
    WHOIS_AVAILABLE = True
except ImportError:
    WHOIS_AVAILABLE = False

try:
    import dns.resolver
    DNS_AVAILABLE = True
except ImportError:
    DNS_AVAILABLE = False

DISPOSABLE_DOMAINS = {
    'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'yopmail.com',
    'trashmail.com', 'sharklasers.com', 'spam4.me', 'dispostable.com',
    'mailnull.com', 'spamgourmet.com', 'trashmail.at', 'trashmail.io',
    'trashmail.me', 'trashmail.net', 'discard.email', 'fakeinbox.com',
    'maildrop.cc', 'harakirimail.com', '10minutemail.com', 'tempinbox.com',
    'filzmail.com', 'throwam.com', 'guerrillamail.info', 'guerrillamail.biz',
    'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
    'tempr.email', 'grr.la', 'mailscrap.com', 'nospam.ze.tc',
    'getairmail.com', 'mailnew.com', 'spamevader.com', 'notmailinator.com',
}

MAJOR_PROVIDERS = {
    'gmail.com': 'Google Gmail',
    'googlemail.com': 'Google Gmail',
    'yahoo.com': 'Yahoo Mail',
    'yahoo.co.uk': 'Yahoo Mail',
    'yahoo.fr': 'Yahoo Mail',
    'yahoo.co.in': 'Yahoo Mail',
    'hotmail.com': 'Microsoft Hotmail',
    'hotmail.co.uk': 'Microsoft Hotmail',
    'outlook.com': 'Microsoft Outlook',
    'live.com': 'Microsoft Live',
    'msn.com': 'Microsoft MSN',
    'icloud.com': 'Apple iCloud',
    'me.com': 'Apple Me',
    'mac.com': 'Apple Mac',
    'protonmail.com': 'ProtonMail',
    'proton.me': 'ProtonMail',
    'tutanota.com': 'Tutanota',
    'tuta.io': 'Tutanota',
    'zoho.com': 'Zoho Mail',
    'aol.com': 'AOL Mail',
    'yandex.com': 'Yandex Mail',
    'yandex.ru': 'Yandex Mail',
    'mail.com': 'Mail.com',
    'gmx.com': 'GMX Mail',
    'gmx.net': 'GMX Mail',
    'fastmail.com': 'Fastmail',
    'fastmail.fm': 'Fastmail',
    'pm.me': 'ProtonMail',
}


class EmailOSINT:
    def __init__(self, email):
        self.email = email.lower().strip()

    def _validate_format(self):
        pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, self.email))

    def _parse_email(self):
        parts = self.email.rsplit('@', 1)
        if len(parts) == 2:
            return parts[0], parts[1]
        return None, None

    def _check_gravatar(self, email):
        email_hash = hashlib.md5(email.strip().lower().encode()).hexdigest()
        url = f'https://www.gravatar.com/avatar/{email_hash}?d=404'
        try:
            resp = requests.get(url, timeout=5, allow_redirects=False)
            exists = resp.status_code == 200
            return {
                'exists': exists,
                'avatar_url': f'https://www.gravatar.com/avatar/{email_hash}?s=200' if exists else None,
                'profile_url': f'https://gravatar.com/{email_hash}' if exists else None,
                'hash': email_hash,
            }
        except Exception as e:
            return {'exists': None, 'error': str(e), 'hash': email_hash}

    def _get_mx_records(self, domain):
        if not DNS_AVAILABLE:
            return {'error': 'dnspython not installed'}
        try:
            records = dns.resolver.resolve(domain, 'MX')
            return {
                'records': [
                    {'priority': r.preference, 'exchange': str(r.exchange).rstrip('.')}
                    for r in sorted(records, key=lambda x: x.preference)
                ]
            }
        except dns.resolver.NXDOMAIN:
            return {'error': 'Domain does not exist'}
        except dns.resolver.NoAnswer:
            return {'records': [], 'note': 'No MX records found'}
        except Exception as e:
            return {'error': str(e)}

    def _get_txt_records(self, domain):
        if not DNS_AVAILABLE:
            return {'spf': None, 'dmarc': None}
        spf = None
        dmarc = None
        try:
            records = dns.resolver.resolve(domain, 'TXT')
            for r in records:
                rdata = str(r).strip('"')
                if rdata.startswith('v=spf1'):
                    spf = rdata
        except Exception:
            pass
        try:
            dmarc_records = dns.resolver.resolve(f'_dmarc.{domain}', 'TXT')
            for r in dmarc_records:
                rdata = str(r).strip('"')
                if 'v=DMARC1' in rdata:
                    dmarc = rdata
        except Exception:
            pass
        return {'spf': spf, 'dmarc': dmarc}

    def _get_whois(self, domain):
        if not WHOIS_AVAILABLE:
            return {'error': 'python-whois not installed'}
        try:
            w = python_whois.whois(domain)
            result = {}
            if w.registrar:
                result['registrar'] = w.registrar if isinstance(w.registrar, str) else w.registrar[0]
            if w.creation_date:
                cd = w.creation_date
                result['creation_date'] = str(cd[0] if isinstance(cd, list) else cd)
            if w.expiration_date:
                ed = w.expiration_date
                result['expiration_date'] = str(ed[0] if isinstance(ed, list) else ed)
            if w.updated_date:
                ud = w.updated_date
                result['updated_date'] = str(ud[0] if isinstance(ud, list) else ud)
            if w.country:
                result['country'] = w.country if isinstance(w.country, str) else w.country[0]
            if w.org:
                result['organization'] = w.org if isinstance(w.org, str) else w.org[0]
            if w.name_servers:
                ns = w.name_servers
                result['name_servers'] = [str(n).lower() for n in (ns if isinstance(ns, list) else [ns])][:4]
            return result if result else {'note': 'No WHOIS data available'}
        except Exception as e:
            return {'error': str(e)}

    def _check_hibp(self, email):
        api_key = os.environ.get('HIBP_API_KEY', '')
        if not api_key:
            return {'configured': False}
        headers = {'hibp-api-key': api_key, 'User-Agent': 'Shebe-OSINT-Tool'}
        url = f'https://haveibeenpwned.com/api/v3/breachedaccount/{requests.utils.quote(email)}'
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                breaches = resp.json()
                return {
                    'configured': True,
                    'breached': True,
                    'count': len(breaches),
                    'breaches': [
                        {
                            'name': b['Name'],
                            'date': b.get('BreachDate', 'Unknown'),
                            'data_classes': b.get('DataClasses', [])[:5],
                        }
                        for b in breaches[:15]
                    ],
                }
            elif resp.status_code == 404:
                return {'configured': True, 'breached': False, 'count': 0}
            else:
                return {'configured': True, 'error': f'API returned {resp.status_code}'}
        except Exception as e:
            return {'configured': True, 'error': str(e)}

    def gather(self):
        if not self._validate_format():
            return {'error': f'Invalid email format: {self.email}', 'valid': False}

        username, domain = self._parse_email()
        is_disposable = domain in DISPOSABLE_DOMAINS
        provider = MAJOR_PROVIDERS.get(domain)
        is_corporate = not provider and not is_disposable

        # Analyse username patterns
        username_notes = []
        if re.match(r'.*\d{4}$', username):
            year = int(username[-4:])
            if 1950 <= year <= 2010:
                username_notes.append(f'Username may contain birth year: {year}')
        if re.match(r'^\d{10}$', username):
            username_notes.append('Username looks like a phone number')
        if '.' in username or '_' in username:
            username_notes.append('Username contains separator (firstname.lastname pattern likely)')

        mx = self._get_mx_records(domain)
        txt = self._get_txt_records(domain)
        gravatar = self._check_gravatar(self.email)
        breach = self._check_hibp(self.email)
        whois_data = self._get_whois(domain) if is_corporate else {'note': 'Skipped for major/known providers'}

        encoded_email = requests.utils.quote(self.email)

        return {
            'target': self.email,
            'valid': True,
            'username': username,
            'domain': domain,
            'provider': provider or ('Disposable/Temporary Email' if is_disposable else 'Custom / Corporate Domain'),
            'is_disposable': is_disposable,
            'is_corporate': is_corporate,
            'username_notes': username_notes,
            'gravatar': gravatar,
            'mx_records': mx,
            'txt_records': txt,
            'whois': whois_data,
            'breach_data': breach,
            'search_links': {
                'Google (exact)': f'https://www.google.com/search?q="{encoded_email}"',
                'Bing': f'https://www.bing.com/search?q="{encoded_email}"',
                'Twitter/X': f'https://twitter.com/search?q={encoded_email}',
                'LinkedIn': f'https://www.linkedin.com/search/results/all/?keywords={encoded_email}',
                'GitHub Users': f'https://github.com/search?q={encoded_email}&type=users',
                'Google Dork (Social)': f'https://www.google.com/search?q="{encoded_email}"+site:linkedin.com+OR+site:twitter.com+OR+site:github.com',
                'Google Dork (All)': f'https://www.google.com/search?q="{encoded_email}"+OR+"{username}"',
                'Google Images': f'https://www.google.com/search?q="{encoded_email}"&tbm=isch',
            },
            'username_profile_links': {
                'GitHub': f'https://github.com/{username}',
                'Twitter/X': f'https://twitter.com/{username}',
                'Instagram': f'https://instagram.com/{username}',
                'Reddit': f'https://reddit.com/u/{username}',
                'YouTube': f'https://youtube.com/@{username}',
                'TikTok': f'https://tiktok.com/@{username}',
                'Keybase': f'https://keybase.io/{username}',
            },
        }
