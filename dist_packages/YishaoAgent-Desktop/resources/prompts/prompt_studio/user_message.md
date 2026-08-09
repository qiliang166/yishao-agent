Generate a complete set of prompt configurations for:

Industry/Topic: {{industry_topic}}
Purpose/Use Case: {{purpose_description}}

Here are the reference configurations — use them ONLY as a format/depth reference. Do NOT copy their industry content (they may be about a completely different industry):

```json
{{ref_json}}
```

Requirements recap:
1. column_configs: EXACTLY 9 entries covering slots c1_text, c1_video, c1_file, c2_sop, c2_dao, c2_yanxi, c3, c4, c5. Redesign every role, chapter, table and example for "{{industry_topic}}".
2. c3/c4/c5 labels are fixed (文档课件/分析PPT/综合PPT); speech labels fixed (文档演讲/分析演讲/综合演讲); tts labels fixed (文档语音/分析语音/综合语音).
3. Keep all JSON schemas, page_type vocabulary and output-format instructions unchanged — only industry semantics change.
4. speech_configs: 3 entries. tts_configs: 3 entries. core_prompt_configs: 25-40 entries with unique prompt_key.
5. Every prompt and skill must be non-empty.

Output ONLY the complete JSON object with all 9+3+3+(25-40) config entries.
