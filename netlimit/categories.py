"""Default site categories and the domains that belong to each.

These lists are intentionally small starter sets -- in production they would
be swapped for a maintained threat/category feed (e.g. a commercial
URL-categorization list). Admins can add/remove domains via the dashboard.
"""

DEFAULT_CATEGORIES = {
    "social_media": {
        "description": "Social networking and messaging platforms",
        "domains": [
            "facebook.com", "instagram.com", "twitter.com", "x.com",
            "tiktok.com", "snapchat.com", "reddit.com", "pinterest.com",
            "linkedin.com",
        ],
    },
    "streaming": {
        "description": "Video and audio streaming services",
        "domains": [
            "youtube.com", "netflix.com", "hulu.com", "twitch.tv",
            "spotify.com", "primevideo.com", "disneyplus.com",
        ],
    },
    "gaming": {
        "description": "Online gaming platforms and game download services",
        "domains": [
            "steampowered.com", "epicgames.com", "roblox.com",
            "battle.net", "ea.com", "miniclip.com",
        ],
    },
    "shopping": {
        "description": "E-commerce and online shopping sites",
        "domains": [
            "amazon.com", "ebay.com", "aliexpress.com", "jumia.co.ke",
            "etsy.com",
        ],
    },
    "adult": {
        "description": "Adult content",
        "domains": [],  # populated from a maintained blocklist in production
    },
    "news": {
        "description": "News and current-affairs sites",
        "domains": [
            "bbc.com", "cnn.com", "nation.africa", "standardmedia.co.ke",
            "reuters.com",
        ],
    },
    "general": {
        "description": "Uncategorized / general browsing (default allow)",
        "domains": [],
    },
}


def seed_categories(session):
    """Insert the default categories and domains if they don't already exist."""
    from netlimit.models import Category, CategoryDomain

    name_to_category = {}
    for name, info in DEFAULT_CATEGORIES.items():
        category = session.query(Category).filter_by(name=name).first()
        if category is None:
            category = Category(name=name, description=info["description"])
            session.add(category)
            session.flush()
        name_to_category[name] = category

        existing_domains = {d.domain for d in category.domains}
        for domain in info["domains"]:
            if domain not in existing_domains:
                category.domains.append(CategoryDomain(domain=domain))

    session.flush()
    return name_to_category
