"""Seeds demo data: departments, categories, default policy rules, and
~400 users -- enough to exercise the dashboard and reports realistically.

Usage:
    python -m netlimit.seed [--db sqlite:///netlimit.db] [--reset]
"""
import argparse
import datetime

from netlimit.categories import seed_categories
from netlimit.db import Base, init_db, session_scope
from netlimit.models import ACTION_BLOCK, ACTION_TIME_RESTRICTED, Department, PolicyRule, User

# (name, headcount, daily_time_quota_minutes, daily_data_quota_mb)
DEPARTMENTS = [
    ("Executive", 10, 300, 10240),
    ("IT", 15, 300, 10240),
    ("Finance", 40, 120, 2048),
    ("HR", 25, 120, 2048),
    ("Sales", 80, 150, 4096),
    ("Marketing", 45, 180, 6144),
    ("Operations", 90, 90, 1536),
    ("Customer Support", 70, 90, 1536),
    ("Engineering", 25, 180, 4096),
]
assert sum(d[1] for d in DEPARTMENTS) == 400

WORK_START = datetime.time(8, 0)
WORK_END = datetime.time(18, 0)

# category -> (action, start, end); start/end only used for TIME_RESTRICTED
STANDARD_RULES = {
    "adult": (ACTION_BLOCK, None, None),
    "gaming": (ACTION_BLOCK, None, None),
    "streaming": (ACTION_TIME_RESTRICTED, WORK_START, WORK_END),
    "social_media": (ACTION_TIME_RESTRICTED, WORK_START, WORK_END),
    "shopping": (ACTION_TIME_RESTRICTED, WORK_START, WORK_END),
}

# Per-department overrides: None removes the standard rule (defaults to allow),
# a bare action string swaps in a full block, a tuple fully replaces the rule.
DEPARTMENT_OVERRIDES = {
    "Executive": {"social_media": None, "shopping": None},
    "Marketing": {"social_media": None},  # marketing runs the company's social accounts
    "IT": {"social_media": ACTION_BLOCK, "streaming": ACTION_BLOCK},
}

FIRST_NAMES = [
    "Amina", "Brian", "Cynthia", "David", "Esther", "Felix", "Grace", "Hassan",
    "Irene", "James", "Kevin", "Lucy", "Michael", "Naomi", "Otieno", "Patricia",
    "Quentin", "Ruth", "Samuel", "Teresa", "Umar", "Victor", "Winnie", "Xavier",
    "Yvonne", "Zachary",
]
LAST_NAMES = [
    "Achieng", "Barasa", "Chebet", "Dube", "Emojong", "Farah", "Gichuru",
    "Hassan", "Ibrahim", "Juma", "Kamau", "Lelei", "Mwangi", "Njoroge",
    "Odhiambo", "Wanjiru", "Kariuki", "Mutua", "Njeri", "Onyango",
]


def _build_department_rules(dept_name):
    rules = dict(STANDARD_RULES)
    for category, override in DEPARTMENT_OVERRIDES.get(dept_name, {}).items():
        if override is None:
            rules.pop(category, None)
        elif isinstance(override, tuple):
            rules[category] = override
        else:
            rules[category] = (override, None, None)
    return rules


def _generate_name(index):
    first = FIRST_NAMES[index % len(FIRST_NAMES)]
    last = LAST_NAMES[(index // len(FIRST_NAMES)) % len(LAST_NAMES)]
    return first, last


def seed(session, num_it_exempt=3):
    categories_by_name = seed_categories(session)

    dept_objs = {}
    for dept_index, (name, headcount, time_quota, data_quota) in enumerate(DEPARTMENTS):
        dept = session.query(Department).filter_by(name=name).first()
        if dept is None:
            dept = Department(
                name=name,
                daily_time_quota_minutes=time_quota,
                daily_data_quota_mb=data_quota,
            )
            session.add(dept)
            session.flush()
        dept_objs[name] = dept

        for category_name, (action, start, end) in _build_department_rules(name).items():
            category = categories_by_name[category_name]
            existing = (
                session.query(PolicyRule)
                .filter_by(department_id=dept.id, user_id=None, category_id=category.id)
                .first()
            )
            if existing is None:
                session.add(PolicyRule(
                    department_id=dept.id, category_id=category.id, action=action,
                    restricted_start=start, restricted_end=end,
                ))
    session.flush()

    global_index = 0
    for dept_index, (name, headcount, _, _) in enumerate(DEPARTMENTS):
        dept = dept_objs[name]
        for local_index in range(headcount):
            first, last = _generate_name(global_index)
            username = f"{first.lower()}.{last.lower()}{global_index}"
            if session.query(User).filter_by(username=username).first():
                global_index += 1
                continue
            is_exempt = name == "IT" and local_index < num_it_exempt
            octet3 = dept_index + 1
            octet4 = (local_index % 254) + 1
            user = User(
                username=username,
                full_name=f"{first} {last}",
                email=f"{username}@example-org.com",
                ip_address=f"10.{octet3}.0.{octet4}",
                department_id=dept.id,
                is_exempt=is_exempt,
            )
            session.add(user)
            global_index += 1
    session.flush()
    return global_index


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="sqlite:///netlimit.db")
    args = parser.parse_args()

    init_db(args.db)
    with session_scope() as session:
        count = seed(session)
    print(f"Seeded {count} users across {len(DEPARTMENTS)} departments into {args.db}")


if __name__ == "__main__":
    main()
