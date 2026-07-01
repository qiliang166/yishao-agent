"""End-to-end test: verify Notion style VI resources load correctly through ALL 5 loading functions."""
import os, sys, json

# Setup paths
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ppt_service import (
    _load_style_from_template,
    _load_style_yaml_text,
    _load_style_vi,
    _load_style_prompt,
    _load_style_vi_section,
    _load_scheme_data,
    _scan_vi_page_types,
    _build_page_type_prompt,
)
from database import get_db

STYLE_ID = "notion"
COLOR_SCHEME = "notion-light"
TEMPLATE_ID = "style-notion"

def test(name, fn, *args, **kwargs):
    try:
        result = fn(*args, **kwargs)
        if result is None:
            print(f"  FAIL: {name} returned None")
            return False
        if isinstance(result, str):
            print(f"  PASS: {name} — {len(result)} chars")
        elif isinstance(result, (list, tuple)):
            print(f"  PASS: {name} — {len(result)} items")
        elif isinstance(result, dict):
            print(f"  PASS: {name} — {len(result)} keys: {list(result.keys())[:5]}")
        else:
            print(f"  PASS: {name} — {type(result).__name__}")
        return True
    except Exception as e:
        print(f"  FAIL: {name} — {e}")
        return False

def test_forbidden_in_result(name, text, forbidden_list):
    found = [f for f in forbidden_list if f in text]
    if found:
        print(f"  FAIL: {name} — leaked: {found}")
        return False
    print(f"  PASS: {name} — clean")
    return True

print("=== E2E VI Loading Chain Test: NOTION style ===\n")

all_pass = True

# 1. Template → style_id resolution
print("[1] Style ID Resolution")
all_pass &= test("_load_style_from_template", _load_style_from_template, TEMPLATE_ID)

style_id = _load_style_from_template(TEMPLATE_ID)
assert style_id == "notion", f"Expected 'notion', got '{style_id}'"
print(f"  PASS: style_id resolved to '{style_id}'")

# 2. Scheme data loading
print("\n[2] Color Scheme Loading")
scheme = _load_scheme_data(STYLE_ID, COLOR_SCHEME)
all_pass &= test("_load_scheme_data", _load_scheme_data, STYLE_ID, COLOR_SCHEME)

assert scheme["primary"] == "#37352f", f"Wrong primary: {scheme['primary']}"
assert scheme["accent"] == "#2383e2", f"Wrong accent: {scheme['accent']}"
assert scheme["background"] == "#ffffff", f"Wrong background: {scheme['background']}"
assert scheme["card_bg"] == "#f7f6f3", f"Wrong card_bg: {scheme['card_bg']}"
print(f"  PASS: primary={scheme['primary']}, accent={scheme['accent']}, bg={scheme['background']}, card_bg={scheme['card_bg']}")

# Verify NO business hex in scheme
business_hex = ['#1a365d', '#e67e22', '#c41e3a', '#0d6b42', '#4f46e5']
for h in business_hex:
    assert h not in str(scheme), f"Business hex {h} leaked into notion scheme!"

# 3. YAML text loading (LLM prompt mode — no hex)
print("\n[3] YAML Text Loading (LLM prompt mode)")
yaml_text = _load_style_yaml_text(STYLE_ID, COLOR_SCHEME, resolve_vars=False)
all_pass &= test("_load_style_yaml_text(resolve_vars=False)", _load_style_yaml_text, STYLE_ID, COLOR_SCHEME, False)
all_pass &= test_forbidden_in_result("yaml LLM mode", yaml_text, business_hex)

# YAML resolved mode (with hex for CSS vars)
yaml_resolved = _load_style_yaml_text(STYLE_ID, COLOR_SCHEME, resolve_vars=True)
all_pass &= test("_load_style_yaml_text(resolve_vars=True)", _load_style_yaml_text, STYLE_ID, COLOR_SCHEME, True)
assert "#37352f" in yaml_resolved, "Notion primary hex not found in resolved YAML"
assert "linear-gradient" not in yaml_resolved.lower() or "none" in yaml_resolved, \
    "Gradient found in notion YAML"
print(f"  PASS: notion hex present, no gradients")

# 4. VI master document
print("\n[4] VI Master Document")
vi = _load_style_vi(STYLE_ID, COLOR_SCHEME)
all_pass &= test("_load_style_vi", _load_style_vi, STYLE_ID, COLOR_SCHEME)
all_pass &= test_forbidden_in_result("vi.md", vi, business_hex)
assert "Structur" in vi, "VI missing Notion identity"
assert "DM Sans" not in vi, "VI leaked DM Sans"
print(f"  PASS: Notion identity confirmed, zero business hex")

# 5. Style prompt
print("\n[5] AI Persona Prompt")
prompt = _load_style_prompt(STYLE_ID, COLOR_SCHEME)
all_pass &= test("_load_style_prompt", _load_style_prompt, STYLE_ID, COLOR_SCHEME)
assert "Notion" in prompt or "structured" in prompt.lower(), "Prompt missing Notion persona"
assert "systematic" in prompt.lower(), "Prompt missing systematic"
print(f"  PASS: Persona hint injected correctly")

# 6. Page types from index.md
print("\n[6] Page Type Scanning")
page_types = _scan_vi_page_types(STYLE_ID)
all_pass &= test("_scan_vi_page_types", _scan_vi_page_types, STYLE_ID)
assert len(page_types) == 27, f"Expected 27 page types, got {len(page_types)}"
print(f"  PASS: {len(page_types)} page types loaded")

# 7. Page type prompt
print("\n[7] Page Type Prompt Builder")
pt_prompt = _build_page_type_prompt(STYLE_ID)
all_pass &= test("_build_page_type_prompt", _build_page_type_prompt, STYLE_ID)
# Page type prompt uses file references from index.md
assert "cover" in pt_prompt.lower(), "cover not found in page type prompt"
assert len(pt_prompt) > 1000, f"Page type prompt too short: {len(pt_prompt)} chars"
print(f"  PASS: Page type prompt built correctly ({len(pt_prompt)} chars)")

# 8. Per-slide VI sections (test a few page types)
print("\n[8] Per-Slide VI Section Loading")
page_types_to_test = ["cover", "content", "data", "summary", "closing"]
for pt in page_types_to_test:
    section = _load_style_vi_section(STYLE_ID, pt, COLOR_SCHEME, resolve_vars=False)
    all_pass &= test(f"_load_style_vi_section({pt})", _load_style_vi_section, STYLE_ID, pt, COLOR_SCHEME, False)
    all_pass &= test_forbidden_in_result(f"section '{pt}'", section, business_hex)
    assert "DM Sans" not in section, f"DM Sans leaked in {pt} section"

# 9. Cross-contamination check: Business still loads correctly
print("\n[9] Business Style Cross-Check")
biz_scheme = _load_scheme_data("business", "chinese-red")
assert biz_scheme["primary"] == "#c41e3a", f"Business primary corrupted: {biz_scheme['primary']}"
print(f"  PASS: Business style intact (primary={biz_scheme['primary']})")

biz_vi = _load_style_vi("business", "chinese-red")
assert "Business Professional" in biz_vi, "Business VI identity lost"
notion_hex_in_biz = ["#37352f" in biz_vi, "#2383e2" in biz_vi, "#f7f6f3" in biz_vi]
assert not any(notion_hex_in_biz), f"Notion hex leaked into business VI!"
print(f"  PASS: Business intact, no Notion cross-contamination")

# 10. Database verification
print("\n[10] Database State")
db = get_db()
row = db.execute("SELECT id, name, type, enabled, style_id, rules FROM templates WHERE id='style-notion'").fetchone()
db.close()
r = dict(row)
rules = json.loads(r["rules"])
assert r["enabled"] == 1, f"Notion not enabled: {r['enabled']}"
assert rules["style_id"] == "notion", f"Wrong rules.style_id: {rules['style_id']}"
assert r["style_id"] == "notion", f"Wrong column style_id: {r['style_id']}"
print(f"  PASS: DB record: enabled={r['enabled']}, style_id={r['style_id']}, rules.style_id={rules['style_id']}")

print()
if all_pass:
    print("=" * 60)
    print("  END-TO-END VERIFICATION: ALL CHECKS PASSED")
    print("  Notion style is fully isolated and functional")
    print("=" * 60)
else:
    print("=" * 60)
    print("  SOME CHECKS FAILED — review above")
    print("=" * 60)
    sys.exit(1)
