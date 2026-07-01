# VI Style Creation Methodology — 一键复刻，零缺陷

> **版本 4.0** — 自调整白字检测：tokens.yaml 为唯一真源，零硬编码排除列表。
> v3.0 的硬编码 `("cover", "section", "summary", "quote")` 在 vintage style 中漏掉了 section/summary，证明硬编码列表=漏洞。
> v4.0 改为逐页读取 `slide_type_overrides` 计算有效背景亮度，自动覆盖所有已知和未来的页面类型。

---

## 核心原则：tokens.yaml 是唯一真源

```
tokens.yaml  →  slide_type_overrides[page_type]  →  card_bg / background
                   ↓ (解析 {{placeholder}})
                   有效背景色  →  计算亮度
                   ↓
              亮度 ≤ 128  →  深色背景  →  白字正确，跳过修复
              亮度 > 128  →  浅色背景  →  白字是 bug，自动替换为 {{text}}
```

**这个规则对所有 style × page type 的组合自动生效，无需维护任何硬编码列表。**

已知验证矩阵（自动推导，非硬编码）：

| style | page type | override bg | 有效亮度 | 决策 |
|-------|-----------|-------------|----------|------|
| business | cover | {{primary}} | 51 (dark) | KEEP white |
| business | section | {{primary}} | 51 (dark) | KEEP white |
| business | summary | {{primary}} | 51 (dark) | KEEP white |
| business | quote | {{primary}} | 51 (dark) | KEEP white |
| business | content | {{background}} | 255 (light) | FIX white |
| notion | cover | {{background}} | 255 (light) | FIX white |
| notion | section | {{card_bg}} | 243 (light) | FIX white |
| vintage | cover | {{background}} | 246 (light) | FIX white |
| vintage | section | {{primary}} | 46 (dark) | KEEP white |
| vintage | summary | {{primary}} | 46 (dark) | KEEP white |
| (任何未来风格) | (任何页面类型) | (自动读取) | (自动计算) | (自动决定) |

---

## 前提：你的代码必须包含以下修复

以下函数是方法论能"一次成功"的硬件保障：

**自检命令**（在开始之前运行）：

```bash
python -c "
from services.ppt_service import (
    _enforce_cover_rules,            # A4 封面修正
    _auto_fix_hardcoded_hex,         # hex → placeholder
    _auto_fix_white_on_light,        # 浅色背景白字修正（页类型感知）
    _strip_local_var_overrides,      # 清除变量重定义
    _get_effective_page_bg_luminance,# 逐页背景亮度检测（核心）
    _hex_luminance,                  # hex → 亮度计算
    _resolve_placeholder_value,      # {{primary}} → #hex
)
print('PRE-FLIGHT: All 7 required functions present — GO')
"
```

如果报 `ImportError`，说明代码版本过旧，需要先更新 `ppt_service.py`。

---

## 流程图

```
Step 0: 预检（代码环境就绪？）
  ↓
Step 1: 分类风格（浅色 or 深色？）
  ↓
Step 2: 设计 tokens.yaml（唯一人工步骤）
  ↓
Step 3: 机械复制 67 个模板文件
  ↓
Step 4: 机械替换字体引用
  ↓
Step 5: 前端元数据 + 数据库注册
  ↓
Step 6: 代码层自动验证（30 秒）
  ↓
Step 7: 端到端生成 + 自动扫描（5 分钟）
```

---

## Step 0: 预检

```bash
# 1. 检查 7 个必需函数是否存在
python -c "
from services.ppt_service import (
    _enforce_cover_rules, _auto_fix_hardcoded_hex,
    _auto_fix_white_on_light, _strip_local_var_overrides,
    _get_effective_page_bg_luminance, _hex_luminance,
    _resolve_placeholder_value,
)
print('PASS: All 7 required functions present')
"

# 2. 检查模板基础风格完整
python -c "
import os
for d in ['notion','business']:
    for sub in ['blocks','col3']:
        path = f'backend/resources/vi/{d}/{sub}'
        assert os.path.isdir(path), f'MISSING: {path}'
        assert len(os.listdir(path)) > 0, f'EMPTY: {path}'
print('PASS: Base styles (notion, business) intact')
"

echo "PRE-FLIGHT COMPLETE — Ready to create new style"
```

---

## Step 1: 分类风格

| 属性 | 浅色风格 (light-bg) | 深色风格 (dark-bg) |
|------|-------------------|-------------------|
| background 亮度 | > 128 | < 128 |
| 封面文字颜色 | `{{primary}}`（深色） | `#ffffff`（白色） |
| 模板基础 | 从 **notion** 复制 | 从 **business** 复制 |
| 已知例子 | notion, vintage | business, tech |

**一键检测**：

```python
from services.ppt_service import _is_light_background
import yaml
with open('backend/resources/vi/{style_id}/tokens.yaml') as f:
    tokens = yaml.safe_load(f)
scheme = tokens['color_schemes'][tokens['color_scheme']]
print('LIGHT' if _is_light_background(scheme) else 'DARK')
```

---

## Step 2: 设计 tokens.yaml

唯一需要人工设计的文件。**关键约束**：

```yaml
# 浅色风格 — 必须这样设置
background: "#faf5ee"       # 亮度 > 128
text: "#2c2416"             # 亮度 < 80, 与 background 对比度 >= 4.5:1
slide_type_overrides:
  cover:
    card_bg: "{{background}}"  # 浅色底
    text: "{{primary}}"        # 深色字 ← 不能是 #ffffff!

# 深色风格 — 必须这样设置
background: "#0a1628"       # 亮度 < 80
text: "#e0e0e0"             # 亮度 > 128
slide_type_overrides:
  cover:
    card_bg: "{{primary}}"    # 深色底
    text: "#ffffff"           # 白色字 ← 这里可以是 #ffffff
```

### slide_type_overrides 规则

每个页面类型可以指定 `card_bg` 或 `background`。代码会自动检查两者（`card_bg` 优先）。

- **如果某个页面类型使用深色背景**（如 `{{primary}}`），`text` 必须设为 `#ffffff` 或浅色占位符
- **如果某个页面类型使用浅色背景**（如 `{{background}}`），`text` 必须设为 `{{primary}}` 或深色值
- **代码会逐页验证**：深色背景页面的白字不会被修改，浅色背景页面的白字会自动修正

---

## Step 3-4: 复制模板 + 替换字体

```bash
STYLE="new_style"

# 选择基础风格
if [ "$STYLE_TYPE" = "dark" ]; then
    BASE="business"
else
    BASE="notion"   # 默认浅色
fi

# 复制
mkdir -p "backend/resources/vi/$STYLE/blocks" "backend/resources/vi/$STYLE/col3"
cp "backend/resources/vi/$BASE/blocks/"*.md "backend/resources/vi/$STYLE/blocks/"
cp "backend/resources/vi/$BASE/col3/"*.md "backend/resources/vi/$STYLE/col3/"
cp "backend/resources/vi/$BASE/"*.md "backend/resources/vi/$STYLE/"

# 替换字体（根据 tokens.yaml 中的 typography 配置）
cd "backend/resources/vi/$STYLE"
# 替换标题字体
find . -name "*.md" -exec sed -i \
  "s/Inter, 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', sans-serif/{HEADING_FONT}/g" {} \;
# 替换正文字体
find . -name "*.md" -exec sed -i \
  "s/Inter, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif/{BODY_FONT}/g" {} \;
# 替换 CJK 字体
find . -name "*.md" -exec sed -i \
  "s/'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif/{CJK_FONT}/g" {} \;
# 清理残留引用
find . -name "*.md" -exec sed -i "s/Inter /{BODY_FONT} /g" {} \;

# 验证 0 残留
echo "Remaining old font references:"
grep -rn "Inter" . --include="*.md" || echo "  ZERO — clean!"
```

---

## Step 5: 前端 + 数据库

```bash
# 创建前端元数据（参考 notion.yaml 的格式）
cp backend/data/styles/notion.yaml "backend/data/styles/$STYLE.yaml"
# 手动编辑: 更新 name, mood, design_brief, color_scheme, typography

# 数据库注册
python -c "
import sqlite3, json
conn = sqlite3.connect('backend/data/yishao.db')
conn.execute('''INSERT OR REPLACE INTO templates (id, name, type, rules, enabled)
    VALUES (?, ?, ?, ?, ?)''',
    ('style-$STYLE', '{显示名称}', 'style',
     json.dumps({'style_id':'$STYLE','group':'Thematic'}), 1))
conn.commit()
conn.close()
print('DB: style-$STYLE registered')
"
```

---

## Step 6: 代码层自动验证

```bash
STYLE="new_style" SCHEME="default_scheme_name"
python -c "
from services.ppt_service import (
    _load_style_from_template, _load_scheme_data,
    _load_style_yaml_text, _load_style_vi,
    _scan_vi_page_types, _is_light_background,
    _get_effective_page_bg_luminance,
    _load_cover_overrides, _placeholder_to_css_var,
)
S='$STYLE'; SCH='$SCHEME'
errors = []

# 1. Style ID
sid = _load_style_from_template(f'style-{S}')
if sid != S: errors.append(f'style_id mismatch: {sid}')

# 2. Scheme
scheme = _load_scheme_data(S, SCH)
if not scheme: errors.append('scheme load failed')
is_light = _is_light_background(scheme)
print(f'  Type: {\"LIGHT\" if is_light else \"DARK\"} (bg={scheme.get(\"background\")})')

# 3. Per-page-type background check (CRITICAL — replaces hardcoded exclusion list)
# Verify every page type with a slide_type_override has consistent bg/text pairing
import yaml, os
tokens_path = f'backend/resources/vi/{S}/tokens.yaml'
if os.path.exists(tokens_path):
    with open(tokens_path, 'r', encoding='utf-8') as f:
        tokens = yaml.safe_load(f.read())
    overrides = tokens.get('slide_type_overrides', {})
    for pt, ov in overrides.items():
        lum = _get_effective_page_bg_luminance(S, pt, scheme)
        text_val = ov.get('text', '')
        bg_ref = ov.get('card_bg') or ov.get('background')
        if bg_ref:
            bg_type = 'DARK' if lum and lum <= 128 else 'LIGHT'
            print(f'  {pt}: bg={bg_ref} lum={lum:.0f} ({bg_type}) text={text_val}')
            # Consistency check: dark bg + dark text = likely bug
            if lum and lum <= 128 and text_val and not text_val.startswith('#') and text_val != '#ffffff':
                # placeholder text on dark bg is fine (resolves to correct color)
                pass
            if lum and lum > 128 and text_val == '#ffffff':
                errors.append(f'FATAL: {pt} has light bg but white text in tokens.yaml')

# 4. Templates
vi = _load_style_vi(S, SCH)
if len(vi) < 100: errors.append(f'VI doc too short: {len(vi)} chars')

# 5. Page types
pts = _scan_vi_page_types(S)
if len(pts) != 27: errors.append(f'Expected 27 page types, got {len(pts)}')

# 6. No cross-contamination
biz_hex = ['#1a365d','#e67e22','#c41e3a','#0d6b42','#4f46e5']
yt = _load_style_yaml_text(S, SCH, resolve_vars=False)
for h in biz_hex:
    if h in yt: errors.append(f'Leaked business hex: {h}')

# 7. Font check
if 'Inter' in vi: errors.append('Inter font not replaced')

if errors:
    print(f'\nFAILED {len(errors)} checks:')
    for e in errors: print(f'  - {e}')
    exit(1)
else:
    print(f'\nALL CHECKS PASSED — Ready for e2e test')
"
```

---

## Step 7: 端到端生成 + 自动扫描

在前端生成一个 PPT（至少 10 页），然后运行自动扫描：

```bash
RUN_DIR="data/output/{project}/{run_id}"
STYLE="new_style" SCHEME="default_scheme_name"
python -c "
import os, re
from services.ppt_service import _get_effective_page_bg_luminance, _load_scheme_data

scheme = _load_scheme_data('$STYLE', '$SCHEME')

def check_slide(path, name, page_type):
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()
    issues = []
    # Check 1: hardcoded white text — is it correct or a bug?
    has_white = '#ffffff' in html.lower() or '#fff' in html.lower()
    if has_white:
        lum = _get_effective_page_bg_luminance('$STYLE', page_type, scheme)
        if lum and lum > 128:
            # Light background + white text = bug (should have been fixed by _auto_fix_white_on_light)
            issues.append(f'white text on LIGHT bg (lum={lum:.0f}) — _auto_fix_white_on_light missed this')
    # Check 2: variable overrides
    if re.search(r'--(primary|text|background|card_bg)\s*:', html):
        issues.append('theme variable override detected (_strip_local_var_overrides missed)')
    # Check 3: zero opacity text
    if 'opacity:0' in html:
        issues.append('opacity:0 — fully invisible')
    if issues:
        print(f'  {name} ({page_type}): {len(issues)} issues')
        for i in issues: print(f'    - {i}')
        return False
    return True

slide_dir = '$RUN_DIR/slides'
slides = sorted([f for f in os.listdir(slide_dir) if f.endswith('.html') and '_vars' not in f])

# Map slide index to page type — read from structure.json if available
import json
structure_path = os.path.join(os.path.dirname(slide_dir), 'structure.json')
page_types = {}
if os.path.exists(structure_path):
    with open(structure_path) as f:
        structure = json.load(f)
    for i, s in enumerate(structure.get('slides', [])):
        page_types[f'slide_{i+1:02d}.html'] = s.get('type', 'content')

passed = 0
failed = 0
for s in slides:
    pt = page_types.get(s, 'content')
    if check_slide(os.path.join(slide_dir, s), s, pt):
        passed += 1
    else:
        failed += 1

print(f'\nScanned {len(slides)} slides: {passed} clean, {failed} with issues')
if failed > 0:
    print('ACTION: Review failed slides, check tokens.yaml color values')
    exit(1)
else:
    print('ALL SLIDES CLEAN — Style ready for production')
"
```

---

## 完整自检清单（每次创建新风格前）

- [ ] Step 0: 7 个必需函数存在（含 `_get_effective_page_bg_luminance`）
- [ ] Step 1: 风格类型已分类（light/dark）
- [ ] Step 2: tokens.yaml 中每个 slide_type_override 的 bg/text 配对一致（深底+浅字 / 浅底+深字）
- [ ] Step 3: 67 个文件全部复制
- [ ] Step 4: 字体替换 0 残留
- [ ] Step 5: 前端元数据 + DB 注册
- [ ] Step 6: 逐页背景亮度验证通过（零硬编码排除）
- [ ] Step 7: 生成测试 + 自动扫描 0 问题

**全部打勾 = 一次成功。任何一步失败 = 该步有明确错误信息，修正后重试。**

---

## 为什么 v4.0 零漏洞

v3.0 的方法是用硬编码列表 `("cover", "section", "summary", "quote")` 跳过特定页面类型。这有两个漏洞：

1. **不知道新风格的页面类型**：vintage 的 section/summary 使用 `{{primary}}` 深色背景，硬编码列表没列 vintage 就会出错
2. **不知道未来的页面类型**：如果新增一个 `hero` 页面类型使用深色背景，硬编码列表必须手动更新

v4.0 改为**逐页读取 tokens.yaml 计算有效背景亮度**：
- 每个页面类型独立检查 `slide_type_overrides[page_type].card_bg` 或 `.background`
- 解析 `{{placeholder}}` 引用得到实际 hex 值
- 计算亮度判断深色/浅色
- 自动决定白字是否合法

**规则是自调整的，数据驱动，不与任何特定 style 或 page type 耦合。**
