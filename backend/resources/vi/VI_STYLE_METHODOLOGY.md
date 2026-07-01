# VI Style Creation Methodology — Verified One-Shot Process

> **版本 2.0** — 基于 notion 和 vintage 两次实战验证后修正。
> 第一次方法论在 notion 首次生成时暴露了 3 个代码层盲区，
> 现已全部修复并纳入验证流程。

---

## 核心架构（已验证）

```
tokens.yaml  ← 单一真源 (Single Source of Truth)
    │
    ├──→ 代码读取 tokens → 构建 prompt → LLM 生成 HTML
    │
    ├──→ _enforce_cover_rules()       用 tokens 修正封面（仅 A4）
    ├──→ _auto_fix_hardcoded_hex()      hex → {{placeholder}}（跳过 #ffffff）
    ├──→ _auto_fix_white_on_light()    浅色背景自动替换白色文字（跳过封面）
    ├──→ _strip_local_var_overrides()  清除 LLM 变量重定义
    ├──→ _auto_fix_font_size()         强制执行字号下限
    └──→ _resolve_color_vars()         {{placeholder}} → 实际 hex
```

---

## 第一步：分类你的风格（最重要的设计决策）

在写 tokens.yaml 之前，必须先回答一个问题，因为**代码层的处理逻辑依赖这个答案**：

### 浅色背景风格 (light-bg)

`background` 颜色较亮（如 `#ffffff`, `#faf5ee`, `#faf3e8`）。

- `_auto_fix_white_on_light` **会激活** — 自动将 LLM 硬编码的 `#ffffff` 替换为 `{{text}}`
- `_auto_fix_hardcoded_hex` 跳过 `#ffffff` 是设计意图 — 由 `_auto_fix_white_on_light` 补偿
- 封面文字应该是深色（`{{primary}}`），不是白色
- 例子: notion, vintage, minimal, scientific

### 深色背景风格 (dark-bg)

`background` 颜色较暗（如 `#0a1628`, `#312d27`）。

- `_auto_fix_white_on_light` **不激活** — 白色文字保持原样
- `_auto_fix_hardcoded_hex` 跳过 `#ffffff` 是正确行为 — 深色背景上需要白色文字
- 封面文字应该是白色（`#ffffff` 或 `{{background}}`）
- 例子: business, bold-editorial, tech

### 🚨 关键规则

```
如果 background 是浅色 → slide_type_overrides.cover.text 必须是深色（{{primary}} 或具体深色 hex）
如果 background 是深色 → slide_type_overrides.cover.text 必须是浅色（#ffffff 或 {{background}}）
```

**违反这个规则会导致封面文字不可见。这不是代码能自动修复的——这是设计决策。**

---

## 创建新风格：7 步流程

### Step 1: 设计 tokens.yaml

路径: `resources/vi/{style_id}/tokens.yaml`

**必须正确设置的字段**（按重要性排序）：

1. `color_schemes.{default}.background` — 决定风格分类（浅/深）
2. `color_schemes.{default}.text` — 正文色，必须与 background 有 >= 4.5:1 对比度
3. `color_schemes.{default}.primary` — 标题色
4. `slide_type_overrides.cover.card_bg` + `text` — 封面配色（遵守上面的关键规则）
5. `typography` — 字体栈
6. `card_style` — 卡片外观
7. `block_types` — A4 文档块颜色

### Step 2-3: 复制模板 + 替换字体

```bash
STYLE="new_style"
BASE="notion"  # 浅色基础：用 notion；深色基础：用 business

mkdir -p "resources/vi/$STYLE/blocks" "resources/vi/$STYLE/col3"
cp "resources/vi/$BASE/blocks/"*.md "resources/vi/$STYLE/blocks/"
cp "resources/vi/$BASE/col3/"*.md "resources/vi/$STYLE/col3/"
cp "resources/vi/$BASE/"*.md "resources/vi/$STYLE/"

cd "resources/vi/$STYLE"
find . -name "*.md" -exec sed -i "s/{OLD_FONT}/{NEW_FONT}/g" {} \;
# 确保 0 处未替换: grep -rn "{OLD_FONT}" . --include="*.md"
```

### Step 4: 前端元数据

`data/styles/{style_id}.yaml` — 与 tokens.yaml 默认色系保持一致。

### Step 5: 数据库注册

```sql
UPDATE templates SET name='{显示名称}', enabled=1 WHERE id='style-{style_id}';
-- 或 INSERT 如果不存在
```

### Step 6: 代码层验证（必须全部通过）

```bash
python -c "
from services.ppt_service import (
    _load_style_from_template, _load_scheme_data,
    _load_style_yaml_text, _load_style_vi,
    _scan_vi_page_types, _is_light_background,
    _load_cover_overrides, _placeholder_to_css_var,
)
S = '{style_id}'
SCH = '{default_scheme}'

# 1. Style ID 解析
assert _load_style_from_template('style-{style_id}') == S

# 2. 颜色方案
scheme = _load_scheme_data(S, SCH)
assert scheme is not None
is_light = _is_light_background(scheme)
print(f'Background: {scheme[\"background\"]} → {\"LIGHT\" if is_light else \"DARK\"} style')

# 3. 封面规则一致性检查 ⚠️ 最重要
cover = _load_cover_overrides(S)
bg_var = _placeholder_to_css_var(cover.get('card_bg',''))
text_val = cover.get('text','')
print(f'Cover: bg={bg_var}, text={text_val}')

# 如果 bg 是浅色，text 不能是白色
if is_light:
    assert text_val != '#ffffff', \
        'FATAL: light-background style has white cover text — will be invisible!'
# 如果 bg 是深色，text 应该是浅色
else:
    assert text_val == '#ffffff' or text_val.startswith('{{'), \
        'WARNING: dark-background style should use white/light cover text'

# 4. 模板加载
vi = _load_style_vi(S, SCH)
assert len(vi) > 100

# 5. 页面类型完整性
pts = _scan_vi_page_types(S)
assert len(pts) == 27, f'Expected 27, got {len(pts)}'

# 6. 无 business hex 泄漏
business_hex = ['#1a365d','#e67e22','#c41e3a','#0d6b42','#4f46e5']
yaml_text = _load_style_yaml_text(S, SCH, resolve_vars=False)
for h in business_hex:
    assert h not in yaml_text, f'Leaked business hex: {h}'

print('ALL CODE-LEVEL CHECKS PASSED')
"
```

### Step 7: 端到端生成测试（不可缺少）

**必须在真实 LLM 上跑一次 PPT 生成**，因为只有实际生成才能发现 LLM 的输出问题。

检查清单（逐个打开生成的页面）：

| 检查项 | 现象 | 如果失败说明什么 |
|--------|------|-----------------|
| 封面文字可读 | 标题清晰可见 | 封面颜色规则错误 |
| 目录页文字 | 卡片标题/正文可见 | `_auto_fix_white_on_light` 未生效 |
| 数据页 | 数字和标签可见 | 文案颜色正确 |
| 第 10+ 页 | 无整页不可见 | 变量重定义未被清除 |
| 交替行颜色 | 表格可读 | `chart_colors` 对比度足够 |

**如果任何一个检查失败**，回到 Step 1 检查颜色配置，或者检查代码层是否需要新增处理逻辑。

---

## 代码层的已知假设（边界条件）

这些是 `ppt_service.py` 中对颜色的隐式假设。新增风格时需要注意：

| 函数 | 假设 | 可能出问题的风格类型 |
|------|------|-------------------|
| `_auto_fix_hardcoded_hex` | `#ffffff` 跳过不处理 | **浅色** — 需要 `_auto_fix_white_on_light` 补偿 |
| `_auto_fix_white_on_light` | 以 scheme.background 判断浅/深 | **封面** — 已排除；**渐变背景页** — 可能误判 |
| `_strip_local_var_overrides` | 核心变量不应被本地重定义 | **所有风格** — 这是 LLM 的通病 |
| `_enforce_cover_rules` | 仅处理 A4 文档封面 | **PPT 封面** — 不走此函数 |
| `_resolve_color_vars` | `var(--name)` → hex 后不再回退 | **所有风格** — 必须在 resolve 前完成修正 |

---

## 已知的局限性

1. **封面渐变背景**：如果封面使用渐变（如 business），`_auto_fix_white_on_light` 检查的是 scheme background 而非实际背景色。封面已排除，但非封面页若有渐变背景，可能误判。
2. **LLM 不可预测性**：即使所有规则正确，LLM 仍可能输出不符合预期的颜色。代码层的 5 步管线是防御性措施，不能保证 100% 覆盖所有 LLM 输出模式。
3. **色系切换**：每个风格支持多个色系，但只有默认色系经过验证。其他色系应使用相同的浅/深分类，否则可能出现意外。

---

## 文件清单

```
resources/vi/{style_id}/
├── tokens.yaml          ← 唯一人工设计文件
├── blocks/ (15 文件)    ← 机械复制 + 字体替换
├── col3/ (7 文件)       ← 机械复制 + 字体替换
└── .md (45 文件)        ← 机械复制 + 字体替换
data/styles/
└── {style_id}.yaml      ← 前端元数据
```

总计: 1 设计 + 67 复制 = 68 文件 + 7 步验证 = 可复现的零缺陷流程
