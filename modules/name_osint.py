import requests


class NameOSINT:
    def __init__(self, name):
        self.name = name.strip()

    def _parse_name(self, name):
        parts = name.strip().split()
        return {
            'full': name.strip(),
            'first': parts[0] if parts else '',
            'last': parts[-1] if len(parts) > 1 else '',
            'middle': ' '.join(parts[1:-1]) if len(parts) > 2 else '',
            'word_count': len(parts),
        }

    def _generate_usernames(self, parts):
        first = parts['first'].lower()
        last = parts['last'].lower()
        middle = parts['middle'].lower() if parts['middle'] else ''
        mi = middle[0] if middle else ''
        fi = first[0] if first else ''
        li = last[0] if last else ''

        # Strip non-alpha characters for username generation
        first_a = ''.join(c for c in first if c.isalpha())
        last_a = ''.join(c for c in last if c.isalpha())
        fi_a = first_a[0] if first_a else ''
        li_a = last_a[0] if last_a else ''

        usernames = []
        if first_a and last_a:
            usernames += [
                f'{first_a}{last_a}',
                f'{first_a}.{last_a}',
                f'{first_a}_{last_a}',
                f'{first_a}-{last_a}',
                f'{fi_a}{last_a}',
                f'{fi_a}.{last_a}',
                f'{fi_a}_{last_a}',
                f'{first_a}{li_a}',
                f'{last_a}{first_a}',
                f'{last_a}.{first_a}',
                f'{last_a}_{first_a}',
                f'{last_a}{fi_a}',
                f'{first_a}{last_a}1',
                f'{first_a}{last_a}2',
                f'{first_a}_{last_a}_',
            ]
            if mi:
                usernames += [
                    f'{first_a}{mi}{last_a}',
                    f'{first_a}.{mi}.{last_a}',
                    f'{fi_a}{mi}{last_a}',
                ]
        elif first_a:
            usernames.append(first_a)

        seen = set()
        deduped = []
        for u in usernames:
            if u not in seen:
                seen.add(u)
                deduped.append(u)
        return deduped

    def _check_github(self, usernames):
        results = []
        for username in usernames[:8]:
            try:
                resp = requests.get(
                    f'https://api.github.com/users/{username}',
                    timeout=5,
                    headers={'Accept': 'application/vnd.github.v3+json'},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results.append({
                        'username': username,
                        'found': True,
                        'name': data.get('name'),
                        'bio': data.get('bio'),
                        'location': data.get('location'),
                        'company': data.get('company'),
                        'public_repos': data.get('public_repos'),
                        'followers': data.get('followers'),
                        'url': data.get('html_url'),
                        'avatar': data.get('avatar_url'),
                        'created_at': data.get('created_at'),
                        'blog': data.get('blog'),
                        'email': data.get('email'),
                        'twitter': data.get('twitter_username'),
                    })
                else:
                    results.append({'username': username, 'found': False})
            except Exception as e:
                results.append({'username': username, 'found': None, 'error': 'Request failed'})
        return results

    def gather(self):
        if not self.name or len(self.name) < 2:
            return {'error': 'Name must be at least 2 characters', 'valid': False}

        parts = self._parse_name(self.name)
        usernames = self._generate_usernames(parts)

        github_results = self._check_github(usernames)
        found_on_github = [r for r in github_results if r.get('found')]

        encoded_full = requests.utils.quote(f'"{self.name}"')
        encoded_name = requests.utils.quote(self.name)
        first = parts['first']
        last = parts['last']
        encoded_fl = requests.utils.quote(f'"{first} {last}"') if first and last else encoded_full

        search_links = {
            'Google (full name)': f'https://www.google.com/search?q={encoded_full}',
            'Google News': f'https://www.google.com/search?q={encoded_full}&tbm=nws',
            'Google Images': f'https://www.google.com/search?q={encoded_full}&tbm=isch',
            'Bing': f'https://www.bing.com/search?q={encoded_full}',
            'LinkedIn People': f'https://www.linkedin.com/search/results/people/?keywords={encoded_name}',
            'Twitter/X People': f'https://twitter.com/search?q={encoded_full}&f=user',
            'Facebook People': f'https://www.facebook.com/search/people/?q={encoded_name}',
            'Instagram': f'https://www.instagram.com/explore/search/keyword/?q={encoded_name}',
            'GitHub Users': f'https://github.com/search?q={encoded_full}&type=users',
            'Reddit Users': f'https://www.reddit.com/search/?q={encoded_full}&type=user',
            'TikTok': f'https://www.tiktok.com/search/user?q={encoded_name}',
            'YouTube': f'https://www.youtube.com/results?search_query={encoded_full}',
            'Pipl': f'https://pipl.com/search/?q={encoded_name}',
            'Spokeo': f'https://www.spokeo.com/{requests.utils.quote(self.name.replace(" ", "-"))}',
        }

        google_dorks = {
            'Full name (exact)': f'https://www.google.com/search?q={encoded_full}',
            'LinkedIn profile': f'https://www.google.com/search?q=site:linkedin.com+{encoded_full}',
            'Facebook profile': f'https://www.google.com/search?q=site:facebook.com+{encoded_full}',
            'Twitter/X profile': f'https://www.google.com/search?q=site:twitter.com+{encoded_full}',
            'Instagram profile': f'https://www.google.com/search?q=site:instagram.com+{encoded_full}',
            'GitHub profile': f'https://www.google.com/search?q=site:github.com+{encoded_full}',
            'News articles': f'https://www.google.com/search?q={encoded_full}+site:news.google.com+OR+site:reuters.com+OR+site:bbc.com',
            'Email addresses': f'https://www.google.com/search?q={encoded_full}+%40gmail.com+OR+%40yahoo.com+OR+%40outlook.com',
            'Phone numbers': f'https://www.google.com/search?q={encoded_full}+phone+OR+tel+OR+mobile',
            'Social (all)': f'https://www.google.com/search?q={encoded_full}+site:linkedin.com+OR+site:facebook.com+OR+site:twitter.com+OR+site:instagram.com',
        }

        # Social profile links per username
        username_links = {}
        for un in usernames[:10]:
            username_links[un] = {
                'GitHub': f'https://github.com/{un}',
                'Twitter/X': f'https://twitter.com/{un}',
                'Instagram': f'https://instagram.com/{un}',
                'Reddit': f'https://reddit.com/u/{un}',
                'TikTok': f'https://tiktok.com/@{un}',
                'YouTube': f'https://youtube.com/@{un}',
                'LinkedIn': f'https://linkedin.com/in/{un}',
                'Pinterest': f'https://pinterest.com/{un}',
                'Tumblr': f'https://{un}.tumblr.com',
                'Keybase': f'https://keybase.io/{un}',
                'Twitch': f'https://twitch.tv/{un}',
                'Medium': f'https://medium.com/@{un}',
            }

        return {
            'target': self.name,
            'valid': True,
            'name_parts': parts,
            'possible_usernames': usernames,
            'github_profiles': github_results,
            'github_found_count': len(found_on_github),
            'search_links': search_links,
            'google_dorks': google_dorks,
            'username_profile_links': username_links,
        }
