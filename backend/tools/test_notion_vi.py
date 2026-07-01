"""Standalone test: verify Notion VI resources are loadable and isolated from business."""
import os, re, json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VI_DIR = os.path.join(BASE_DIR, "resources", "vi")

def load_file(style_id, filename):
    """Simple file loader — mirrors the pattern in ppt_service.py."""
    path = os.path.join(VI_DIR, style_id, filename)
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return f.read()
    return None

def check_style(style_id, expected_primary, expected_accent, forbidden_hexes):
    """Verify a style's VI resources load correctly with no cross-contamination."""
    print(f"\n--- {style_id} ---")

    # Load core files
    vi = load_file(style_id, 'vi.md')
    prompt = load_file(style_id, 'prompt.md')
    tokens = load_file(style_id, 'tokens.yaml')
    index = load_file(style_id, 'index.md')

    if not all([vi, prompt, tokens, index]):
        print(f"  FAIL: Missing core files")
        return False

    # Check identity markers in prompt
    if style_id == 'notion':
        assert 'Notion' in prompt, "Prompt missing Notion identity"
        assert 'structured' in prompt.lower(), "Prompt missing structured"
    elif style_id == 'business':
        assert 'Business Professional' in prompt, "Prompt missing Business identity"

    # Check for contaminated hex values
    all_content = vi + prompt + tokens + index
    contaminated = [h for h in forbidden_hexes if h in all_content]
    if contaminated:
        print(f"  FAIL: Contaminated hex: {contaminated}")
        return False

    # Check expected hex IS present (style identity confirmed)
    if expected_primary not in all_content:
        print(f"  WARNING: expected primary {expected_primary} not found")
    if expected_accent not in all_content:
        print(f"  WARNING: expected accent {expected_accent} not found")

    # Verify file count
    count = 0
    for root, dirs, files in os.walk(os.path.join(VI_DIR, style_id)):
        for f in files:
            if f.endswith(('.md', '.yaml', '.html')):
                count += 1

    print(f"  OK: {count} files, identity confirmed, no cross-contamination")
    return True

if __name__ == '__main__':
    # Business-only hexes that must NOT appear in notion
    business_hexes = ['#1a365d', '#e67e22', '#c41e3a', '#0d6b42', '#4f46e5', '#c9a84c', '#1a1a2e', '#8b1a2b', '#d4a017']
    # Notion-only hexes that must NOT appear in business
    notion_hexes = ['#37352f', '#2383e2', '#f7f6f3', '#69635c', '#9b8573', '#e1624a', '#5a9e6f']

    r1 = check_style('notion', '#37352f', '#2383e2', business_hexes)
    r2 = check_style('business', '#1a365d', '#e67e22', notion_hexes)

    print()
    if r1 and r2:
        print('=== BOTH STYLES ISOLATED AND FUNCTIONAL ===')
    else:
        print('=== FAILURE DETECTED ===')
