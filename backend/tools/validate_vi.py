"""Validate VI directory - no external dependencies (pure Python)."""
import os, re, sys

def check_tokens_yaml(path):
    """Basic YAML structure validation without pyyaml."""
    with open(path, encoding='utf-8') as f:
        content = f.read()

    checks = {
        'color_scheme:': 'top-level color_scheme field',
        'color_schemes:': 'color_schemes block',
        'notion-light:': 'notion-light scheme',
        'primary:': 'primary color',
        'accent:': 'accent color',
        'background:': 'background color',
        'typography:': 'typography block',
        'card_style:': 'card_style block',
        'layout_types:': 'layout_types block',
        'card_roles:': 'card_roles block',
        'quality_checklist:': 'quality_checklist block',
        'block_types:': 'block_types block',
    }

    missing = []
    for pattern, desc in checks.items():
        if pattern not in content:
            missing.append(desc)

    if missing:
        print(f'  FAIL: Missing sections: {missing}')
        return False
    print('  PASS — all essential sections found')
    return True

def check_no_business_leak(dir_path):
    """Check for business-specific keywords in all VI files."""
    forbidden = [
        (b'Business Professional', 'title'),
        (b'authoritative', 'mood word'),
        (b'DM Sans', 'old font'),
        (b'deep-blue', 'old color scheme'),
        (b'chinese-red', 'old color scheme'),
        (b'jade-green', 'old color scheme'),
        (b'tech-purple', 'old color scheme'),
        (b'dark-gold', 'old color scheme'),
        (b'#1a365d', 'old hex'),
        (b'#e67e22', 'old hex'),
        (b'#c41e3a', 'old hex'),
        (b'#0d6b42', 'old hex'),
        (b'#4f46e5', 'old hex'),
        (b'[#]c9a84c', 'old hex (dark-gold accent)'),
        (b'PingFang SC.*DM Sans', 'DM Sans reference'),
        (b'box-shadow.*rgba\\(0.*0.*0.*0\\.08\\)', 'old shadow value'),
    ]

    all_ok = True
    for root, dirs, files in os.walk(dir_path):
        for fname in files:
            if not fname.endswith('.md') and not fname.endswith('.yaml'):
                continue
            fpath = os.path.join(root, fname)
            with open(fpath, 'rb') as f:
                content = f.read()
            for pattern, desc in forbidden:
                if re.search(pattern, content):
                    rel = os.path.relpath(fpath, dir_path)
                    print(f'  LEAK in {rel}: {desc}')
                    all_ok = False

    if all_ok:
        print('  PASS — no business keywords leaked')
    return all_ok

def check_index_refs(dir_path):
    """Check index.md file references exist on disk."""
    index_path = os.path.join(dir_path, 'index.md')
    with open(index_path, encoding='utf-8') as f:
        content = f.read()

    # Collect all file references from index.md
    refs = set()
    for line in content.split('\n'):
        m = re.search(r'\|\s*(\S+\.(?:md|yaml|html))\s*\|', line)
        if m:
            refs.add(m.group(1))

    # Check existence
    missing = []
    for ref in refs:
        full_path = os.path.join(dir_path, ref)
        if not os.path.exists(full_path):
            missing.append(ref)

    if missing:
        print(f'  Missing refs: {missing}')
        return False
    print(f'  PASS — all {len(refs)} index references exist on disk')
    return True

def verify_isolation():
    """Ultimate check: verify notion/ never loads business/ resources."""
    ppt_path = 'backend/services/ppt_service.py'
    with open(ppt_path, encoding='utf-8') as f:
        code = f.read()

    # Confirm vi_dir construction is parameterized
    pattern = r'os\.path\.join\(.*["\']resources["\'].*["\']vi["\'].*style_id'
    matches = re.findall(pattern, code)
    if matches:
        print(f'  PASS — vi_dir is parameterized by style_id ({len(matches)} occurrences)')
        return True
    print('  FAIL — vi_dir may be hardcoded')
    return False

if __name__ == '__main__':
    notion_dir = sys.argv[1] if len(sys.argv) > 1 else 'backend/resources/vi/notion'
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    print(f'Checking: {notion_dir}')
    print()

    print('[A1] tokens.yaml structure:')
    a1 = check_tokens_yaml(os.path.join(notion_dir, 'tokens.yaml'))

    print()
    print('[A3] Business keyword leak check (core files):')
    # Only check core files for now (Batch A)
    core_files = ['vi.md', 'prompt.md', 'index.md', 'tokens.yaml']
    all_ok = True
    for fname in core_files:
        fpath = os.path.join(notion_dir, fname)
        if os.path.exists(fpath):
            with open(fpath, 'rb') as f:
                content = f.read()
            forbidden = [b'Business Professional', b'authoritative', b'DM Sans',
                        b'deep-blue', b'chinese-red', b'jade-green', b'tech-purple', b'dark-gold']
            for kw in forbidden:
                if kw in content:
                    print(f'  LEAK in {fname}: {kw.decode()}')
                    all_ok = False
    if all_ok:
        print('  PASS — no business keywords in core files')

    print()
    print('[A4] index.md references:')
    a4 = check_index_refs(notion_dir)

    print()
    print('[ISOLATION] Architectual isolation:')
    verify_isolation()

    print()
    if a1 and all_ok and a4:
        print('=== Quality Gate A: ALL CHECKS PASSED ===')
    else:
        print('=== Quality Gate A: SOME CHECKS FAILED ===')
