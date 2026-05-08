try:
    import phonenumbers
    from phonenumbers import geocoder, carrier, timezone as pn_timezone
    PHONENUMBERS_AVAILABLE = True
except ImportError:
    PHONENUMBERS_AVAILABLE = False


NUMBER_TYPE_MAP = {
    0: 'Fixed Line',
    1: 'Mobile',
    2: 'Fixed Line or Mobile',
    3: 'Toll Free',
    4: 'Premium Rate',
    5: 'Shared Cost',
    6: 'VoIP',
    7: 'Personal Number',
    8: 'Pager',
    9: 'UAN',
    10: 'Unknown',
    27: 'Emergency',
    28: 'Voicemail',
    29: 'Short Code',
    30: 'Standard Rate',
}

COUNTRY_NAMES = {
    'US': 'United States', 'GB': 'United Kingdom', 'CA': 'Canada',
    'AU': 'Australia', 'DE': 'Germany', 'FR': 'France', 'IT': 'Italy',
    'ES': 'Spain', 'NL': 'Netherlands', 'BE': 'Belgium', 'CH': 'Switzerland',
    'AT': 'Austria', 'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark',
    'FI': 'Finland', 'PL': 'Poland', 'RU': 'Russia', 'BR': 'Brazil',
    'MX': 'Mexico', 'AR': 'Argentina', 'CL': 'Chile', 'CO': 'Colombia',
    'IN': 'India', 'CN': 'China', 'JP': 'Japan', 'KR': 'South Korea',
    'SG': 'Singapore', 'HK': 'Hong Kong', 'TW': 'Taiwan', 'TH': 'Thailand',
    'MY': 'Malaysia', 'ID': 'Indonesia', 'PH': 'Philippines', 'VN': 'Vietnam',
    'ZA': 'South Africa', 'NG': 'Nigeria', 'KE': 'Kenya', 'GH': 'Ghana',
    'EG': 'Egypt', 'MA': 'Morocco', 'IL': 'Israel', 'AE': 'United Arab Emirates',
    'SA': 'Saudi Arabia', 'TR': 'Turkey', 'PK': 'Pakistan', 'BD': 'Bangladesh',
    'NZ': 'New Zealand', 'IE': 'Ireland', 'PT': 'Portugal', 'GR': 'Greece',
    'CZ': 'Czech Republic', 'RO': 'Romania', 'HU': 'Hungary', 'UA': 'Ukraine',
}


class PhoneOSINT:
    def __init__(self, phone):
        self.phone = phone.strip()

    def _try_parse(self, phone):
        for attempt in [phone, '+' + phone.lstrip('+'), phone.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')]:
            try:
                parsed = phonenumbers.parse(attempt, None)
                return parsed
            except Exception:
                pass
        return None

    def gather(self):
        if not PHONENUMBERS_AVAILABLE:
            return {'error': 'phonenumbers library not available. Run: pip install phonenumbers'}

        parsed = self._try_parse(self.phone)
        if not parsed:
            return {
                'error': 'Could not parse phone number. Please use international format (e.g. +14155552671)',
                'valid': False,
                'target': self.phone,
            }

        is_valid = phonenumbers.is_valid_number(parsed)
        is_possible = phonenumbers.is_possible_number(parsed)

        # Formats
        formats = {}
        try:
            formats['E.164'] = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
            formats['International'] = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL)
            formats['National'] = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL)
            formats['RFC3966'] = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.RFC3966)
        except Exception:
            pass

        location = None
        try:
            location = geocoder.description_for_number(parsed, 'en') or None
        except Exception:
            pass

        carrier_name = None
        try:
            carrier_name = carrier.name_for_number(parsed, 'en') or None
        except Exception:
            pass

        timezones = []
        try:
            timezones = list(pn_timezone.time_zones_for_number(parsed))
        except Exception:
            pass

        num_type_id = phonenumbers.number_type(parsed)
        line_type = NUMBER_TYPE_MAP.get(num_type_id, f'Unknown ({num_type_id})')

        region_code = phonenumbers.region_code_for_number(parsed)
        country_name = COUNTRY_NAMES.get(region_code, region_code)
        country_dial = f'+{parsed.country_code}'

        e164 = formats.get('E.164', '+' + str(parsed.country_code) + str(parsed.national_number))
        number_digits = e164.replace('+', '')
        national_clean = formats.get('National', '').replace(' ', '').replace('-', '').replace('(', '').replace(')', '')

        notes = []
        if not is_valid:
            notes.append('This number appears to be invalid or unassigned.')
        if line_type == 'VoIP':
            notes.append('VoIP number — may not correspond to a physical location.')
        if line_type == 'Mobile':
            notes.append('Mobile number — carrier may provide approximate location info.')
        if line_type == 'Toll Free':
            notes.append('Toll-free number — typically a business line.')
        if not carrier_name:
            notes.append('Carrier could not be determined (may be ported or prepaid).')

        return {
            'target': self.phone,
            'valid': is_valid,
            'possible': is_possible,
            'country_code': country_dial,
            'region_code': region_code,
            'country_name': country_name,
            'national_number': str(parsed.national_number),
            'location': location or 'Unknown',
            'carrier': carrier_name or 'Unknown',
            'line_type': line_type,
            'timezones': timezones,
            'formats': formats,
            'notes': notes,
            'search_links': {
                'Google (exact)': f'https://www.google.com/search?q="{e164}"',
                'Google (national)': f'https://www.google.com/search?q="{formats.get("National", "")}"',
                'Google Dork': f'https://www.google.com/search?q="{e164}"+OR+"{formats.get("National", "")}"',
                'Bing': f'https://www.bing.com/search?q="{e164}"',
                'Truecaller': f'https://www.truecaller.com/search/{region_code.lower()}/{national_clean}',
                'SpyDialer': f'https://www.spydialer.com/default.aspx?ph={national_clean}',
                'WhoCallsMe': f'https://www.whocalledus.com/number/{number_digits}',
            },
            'communication_links': {
                'WhatsApp': f'https://wa.me/{number_digits}',
                'Telegram': f'https://t.me/+{number_digits}',
                'Signal (click to open app)': f'https://signal.me/#p/{e164}',
            },
        }
