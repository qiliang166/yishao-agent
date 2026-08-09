## SOP 文章（唯一内容来源）
{{SOP_CONTENT}}

## 需要填充的幻灯片（只输出这些幻灯片的 body 和 notes，不要更改其他字段）
{{BATCH_JSON}}

## 输出格式
```json
{{"slides": [{{"seq":1,"heading":"原样保留","body":"正文内容","notes":"备注或反面后果(可选)","layout_hint":"原样保留","visual_weight":"原样保留","key_points":["原文保留"]}}, ...]}}
```

铁律：
- 只输出以上幻灯片，不增减
- heading, layout_hint, visual_weight, key_points, body_rule, images, charts, cards 保持原样
- 仅输出 JSON

## body 填写规则

### 若幻灯片 JSON 中包含 body_rule 字段
严格按照 body_rule 的指示填写 body，不可偏离。

body_rule 常见示例：
- `逐行完整保留，各单元格用 | 分隔，每条记录独占一行，禁止归纳合并` → body 必须是完整的逐行表格数据
- `按步骤逐一列出，每步一行，保留原文所有细节` → body 按步骤逐条列出

### 若幻灯片 JSON 中无 body_rule 字段
body 从此 SOP 对应部分提取归纳，每页至少 80 字，结论先行，必须分段落。
用 \n\n 分隔段落，每段不超过 180 字。并列要点用编号列表（1. 2. 3. 换行分隔）。
禁止把全部内容塞进一个不换行的长段落。
