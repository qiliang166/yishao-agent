"""Style loader — reads PPT-Agent style YAMLs and exposes metadata for the frontend."""
import os
import json
import yaml

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_STYLE_GROUPS = {
    "blueprint": "Tech / Dark",
    "tech": "Tech / Dark",
    "intuition-machine": "Tech / Dark",
    "business": "Professional",
    "minimal": "Professional",
    "notion": "Professional",
    "scientific": "Professional",
    "editorial-infographic": "Professional",
    "creative": "Creative",
    "bold-editorial": "Creative",
    "vector-illustration": "Creative",
    "chalkboard": "Thematic",
    "fantasy-animation": "Thematic",
    "pixel-art": "Thematic",
    "vintage": "Thematic",
    "watercolor": "Thematic",
    "sketch-notes": "Thematic",
}


def _resolve_styles_dir():
    for d in [
        os.path.join(BASE_DIR, "ppt_agent", "skills", "_shared", "references", "styles"),
        os.path.join(BASE_DIR, "services", "ppt_engine", "styles"),
    ]:
        if os.path.isdir(d):
            return d
    return ""


def _load_index():
    for d in [
        os.path.join(BASE_DIR, "ppt_agent", "skills", "_shared"),
        os.path.join(BASE_DIR, "services", "ppt_engine"),
    ]:
        p = os.path.join(d, "index.json")
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    return {"resources": []}


class StyleLoader:
    def __init__(self):
        self._styles_dir = _resolve_styles_dir()
        self._index = _load_index()

    def list_styles(self):
        styles_by_group = {}
        for entry in self._index.get("resources", []):
            if entry.get("domain") != "style":
                continue
            style_id = entry["id"].replace("style-", "")
            yaml_path = os.path.join(self._styles_dir, f"{style_id}.yaml")
            colors = {"primary": "", "accent": "", "background": "", "text": ""}
            mood = ""
            if os.path.exists(yaml_path):
                try:
                    with open(yaml_path, "r", encoding="utf-8") as f:
                        data = yaml.safe_load(f)
                    cs = data.get("color_scheme", {})
                    colors = {
                        "primary": cs.get("primary", ""),
                        "accent": cs.get("accent", ""),
                        "background": cs.get("background", ""),
                        "text": cs.get("text", ""),
                    }
                    mood = data.get("mood", "")
                except Exception:
                    pass

            group = _STYLE_GROUPS.get(style_id, "Other")
            item = {
                "id": style_id,
                "name": entry.get("name", style_id),
                "group": group,
                "mood": mood,
                "keywords": entry.get("keywords", []),
                "colors": colors,
            }
            styles_by_group.setdefault(group, []).append(item)

        return [
            {"group": g, "styles": s}
            for g, s in styles_by_group.items()
        ]
