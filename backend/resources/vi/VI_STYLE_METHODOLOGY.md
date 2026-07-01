# VI Style Creation Methodology — 一键复刻，零缺陷

> **版本 3.0** — 预检 + 自动验证 + 修复管线，确保一次性成功。
> v2.0 在两轮实战中暴露了验证环节缺失，v3.0 补齐为完整闭环。

---

## 前提：你的代码必须包含以下修复

以下 5 个函数是方法论能"一次成功"的硬件保障。缺任何一个，浅色风格都会出 bug。

**自检命令**（在开始之前运行）：

```bash
python -c "
from services.ppt_service import (
    _enforce_cover_rules,       # A4 封面修正
    _auto_fix_hardcoded_hex,    # hex → placeholder
    _auto_fix_white_on_light,   # 浅色背景白字修正
    _strip_local_var_overrides, # 清除变量重定义
    _is_light_background,       # 背景明度检测
)
print('PRE-FLIGHT: All 5 required functions present — GO')
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
# 1. 检查 5 个必需函数是否存在
python -c "
from services.ppt_service import (
    _enforce_cover_rules, _auto_fix_hardcoded_hex,
    _auto_fix_white_on_light, _strip_local_var_overrides,
    _is_light_background,
)
print('PASS: All 5 required functions present')
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

# 3. Cover consistency (CRITICAL)
cover = _load_cover_overrides(S)
if cover:
    bg_var = _placeholder_to_css_var(cover.get('card_bg',''))
    text_val = cover.get('text','')
    print(f'  Cover: bg={bg_var} text={text_val}')
    if is_light and text_val == '#ffffff':
        errors.append('FATAL: light-bg style has white cover text')
    if not is_light and text_val not in ('#ffffff','#FFFFFF','#fff'):
        print('  WARNING: dark-bg style cover text is not white — verify intentional')

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
    print(f'\nALL 7 CHECKS PASSED — Ready for e2e test')
"
```

---

## Step 7: 端到端生成 + 自动扫描

在前端生成一个 PPT（至少 10 页），然后运行自动扫描：

```bash
RUN_DIR="data/output/{project}/{run_id}"
python -c "
import os, re

def check_slide(path, name):
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()
    issues = []
    # Check 1: hardcoded white text
    if '#ffffff' in html.lower() or '#fff' in html.lower():
        issues.append('hardcoded white (#ffffff/#fff) — may be invisible on light bg')
    # Check 2: variable overrides
    if re.search(r'--(primary|text|background|card_bg)\s*:', html):
        issues.append('theme variable override detected')
    # Check 3: zero opacity text
    if 'opacity:0' in html:
        issues.append('opacity:0 — fully invisible')
    # Check 4: color equals background
    # (skip — needs actual color resolution)
    if issues:
        print(f'  {name}: {len(issues)} issues')
        for i in issues: print(f'    - {i}')
        return False
    return True

slide_dir = '$RUN_DIR/slides'
slides = sorted([f for f in os.listdir(slide_dir) if f.endswith('.html') and '_vars' not in f])
passed = 0
failed = 0
for s in slides:
    if check_slide(os.path.join(slide_dir, s), s):
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

- [ ] Step 0: 5 个必需函数存在
- [ ] Step 1: 风格类型已分类（light/dark）
- [ ] Step 2: tokens.yaml 封面规则与风格类型一致
- [ ] Step 3: 67 个文件全部复制
- [ ] Step 4: 字体替换 0 残留
- [ ] Step 5: 前端元数据 + DB 注册
- [ ] Step 6: 7 项自动检查全部通过
- [ ] Step 7: 生成测试 + 自动扫描 0 问题

**全部打勾 = 一次成功。任何一步失败 = 该步有明确错误信息，修正后重试。**
