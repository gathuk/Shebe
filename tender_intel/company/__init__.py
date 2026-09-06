"""Skystar Holdings Limited company profile loader."""
import os

import yaml

PROFILE_PATH = os.path.join(os.path.dirname(__file__), "profile.yaml")


def load_profile(path=PROFILE_PATH):
    """Return the company profile as a dict (see profile.yaml for shape)."""
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)
