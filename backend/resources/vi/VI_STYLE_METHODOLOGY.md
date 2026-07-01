# VI Style Creation Methodology — Zero-Bug One-Shot Process

## Core Architecture

```
tokens.yaml  ← 单一真源 (Single Source of Truth)
    │
    ├──→ 代码读取 tokens → 构建 prompt → LLM 生成 HTML
    │
    ├──→ _enforce_cover_rules() 用 tokens 修正覆盖规则
    │
    ├──→ _resolve_color_vars() 把 {{placeholder}} → hex
    │
    └──→ 模板 (.md 文件) 使用 CSS 变量，不包含 hex 值
```

**原则**: tokens.yaml 做所有设计决策。模板文件只定义结构。代码从 tokens 派生行为。

## 创建新风格：6 步机械操作

### Step 1: 创建 tokens.yaml（唯一需要设计创意的步骤）

路径: `resources/vi/{style_id}/tokens.yaml`

必须包含的字段：
- `color_schemes`: 至少 1 个色系，含 primary/secondary/accent/background/text/card_bg/chart_colors/semantic
- `typography`: heading_font/body_font/cjk_font + 字号/字重规范
- `card_style`: border_radius/shadow/border/gap
- `gradients`: hero_bg/card_highlight（可为 "none"）
- `elevation`: shadow_sm/shadow_md/shadow_lg
- `decoration`: 装饰元素配置
- `slide_type_overrides.cover`: card_bg + text（决定浅底深字还是深底浅字）
- `block_types`: 所有 A4 文档 block 的颜色/字体配置
- `quality_checklist`: 风格特定的质量检查项
- `font_thresholds`: 字号范围
- `safe_area`: 安全区域

### Step 2: 复制模板文件（纯机械操作）

```bash
STYLE="new_style_name"
BASE="notion"  # 选择一个基础风格

# 复制所有模板文件
mkdir -p "resources/vi/$STYLE/blocks" "resources/vi/$STYLE/col3"
cp "resources/vi/$BASE/blocks/"*.md "resources/vi/$STYLE/blocks/"
cp "resources/vi/$BASE/col3/"*.md "resources/vi/$STYLE/col3/"
cp "resources/vi/$BASE/"*.md "resources/vi/$STYLE/"
```

### Step 3: 替换字体引用（纯机械操作）

```bash
cd "resources/vi/$STYLE"

# 替换所有字体引用为新风格的字体
find . -name "*.md" -exec sed -i \
  "s/{BASE_HEADING_FONT}/{NEW_HEADING_FONT}/g" {} \;
find . -name "*.md" -exec sed -i \
  "s/{BASE_BODY_FONT}/{NEW_BODY_FONT}/g" {} \;
find . -name "*.md" -exec sed -i \
  "s/{BASE_CJK_FONT}/{NEW_CJK_FONT}/g" {} \;
```

注意：CSS 变量（`var(--primary)`, `var(--card_bg)` 等）保持不变，因为 tokens.yaml 决定它们的实际值。

### Step 4: 创建前端元数据

路径: `data/styles/{style_id}.yaml`

与 tokens.yaml 保持一致的简化版本，供前端 UI 使用。确保 `slide_type_overrides.cover` 的值与 tokens.yaml 一致。

### Step 5: 注册到数据库

```sql
INSERT INTO templates (id, name, type, rules, enabled)
VALUES ('style-{style_id}', '{显示名称}', 'style',
        '{"style_id":"{style_id}","group":"{分组}"}', 1);
```

### Step 6: 验证

```bash
# 运行 e2e 测试
python -c "
from services.ppt_service import (
    _load_style_from_template,
    _load_scheme_data,
    _load_style_yaml_text,
    _load_style_vi,
    _scan_vi_page_types,
    _build_page_type_prompt,
)
STYLE_ID = '{style_id}'
# 1. 验证 style ID 解析
assert _load_style_from_template('style-{style_id}') == '{style_id}'
# 2. 验证颜色方案加载
scheme = _load_scheme_data(STYLE_ID, '{default_scheme}')
assert scheme is not None
# 3. 验证 YAML 无其他风格的 hex 泄漏
yaml_text = _load_style_yaml_text(STYLE_ID, '{default_scheme}')
# 4. 验证模板加载
vi = _load_style_vi(STYLE_ID, '{default_scheme}')
assert len(vi) > 100
# 5. 验证页面类型
pts = _scan_vi_page_types(STYLE_ID)
assert len(pts) == 27  # 应与基础风格一致
# 6. 验证封面覆盖规则
from services.ppt_service import _load_cover_overrides, _placeholder_to_css_var
cover = _load_cover_overrides(STYLE_ID)
assert cover.get('card_bg'), 'Missing cover card_bg'
assert cover.get('text'), 'Missing cover text'
"
```

## 关键设计决策

### 浅底深字 vs 深底浅字

由 `tokens.yaml` 的 `slide_type_overrides.cover` 决定：

```yaml
# 浅底深字（如 notion, vintage）
slide_type_overrides:
  cover:
    card_bg: "{{background}}"   # 浅色底
    text: "{{primary}}"         # 深色字

# 深底浅字（如 business）
slide_type_overrides:
  cover:
    card_bg: "{{primary}}"      # 深色底
    text: "#ffffff"             # 白色字
```

**不需要修改任何代码**。`_enforce_cover_rules` 从 tokens 自动读取并执行。

### WCAG 对比度

代码自动计算对比度并注入 LLM prompt。确保 primary vs background 的对比度 >= 4.5:1。

## 文件清单

新风格需要以下所有文件：

```
resources/vi/{style_id}/
├── tokens.yaml          ← 设计唯一真源（需人工设计）
├── blocks/ (15 文件)    ← 从基础风格复制 + 字体替换
│   ├── cover.md
│   ├── header.md
│   ├── footer.md
│   ├── title.md
│   ├── info_block.md
│   ├── table_block.md
│   ├── text_block.md
│   ├── list_block.md
│   ├── closing.md
│   ├── copyright.md
│   ├── materials_process.md
│   ├── materials_table.md
│   ├── steps_table.md
│   ├── quality_control.md
│   └── product_definition.md
├── col3/ (7 文件)       ← 从基础风格复制 + 字体替换
│   ├── vi.md
│   ├── cover.md
│   ├── product_definition.md
│   ├── materials_table.md
│   ├── steps_table.md
│   ├── quality_control.md
│   └── closing.md
└── .md (45 文件)        ← 从基础风格复制 + 字体替换
    (PPT pipeline 的所有页面类型和样式指南)
data/styles/
└── {style_id}.yaml      ← 前端元数据（与 tokens.yaml 一致）
```

总计: 1 个人工设计文件 + 67 个机械复制文件 = 68 files
