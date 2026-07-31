"""Full 2-SOP quality regeneration with upgraded gpt54 prompt."""
import sys, os, time, json, re

sys.path.insert(0, '.')
os.chdir(os.path.dirname(os.path.abspath(__file__)))
from services.ppt_service import _stage3_svg
from services.llm_service import generate as llm_generate

# SOP 1: 道术PPT-鲍鱼一品煲
sop1 = [
    {"seq": 1, "type": "cover", "layout": "full_bleed",
     "zones": {"heading": "鲍鱼一品煲", "kicker": "菜品研发部", "lead": "SOP 的道与术",
               "cards": [{"role": "hero", "title": "鲍鱼一品煲",
                           "body": "从烹饪原理到操作技法的深度拆解\n菜品研发部 · 2026 · SOP技术文档"}]}},
    {"seq": 2, "type": "content", "layout": "hero_grid",
     "zones": {"heading": "风味轮分析", "kicker": "味型体系",
               "lead": "鲍鱼一品煲的味型=鲜香×酱浓×脂润",
               "cards": [
                   {"role": "metric", "title": "咸鲜", "body": "鲍汁+蚝油+生抽三重奏", "chart": {"type": "big_number", "value": "9.2", "label": "咸鲜度"}},
                   {"role": "metric", "title": "酱香", "body": "柱侯酱+花生酱+芝麻酱", "chart": {"type": "big_number", "value": "8.5", "label": "酱香度"}},
                   {"role": "metric", "title": "脂香", "body": "鸡油+猪油+鲍鱼自身胶质", "chart": {"type": "big_number", "value": "8.8", "label": "脂香度"}},
                   {"role": "hero", "title": "风味轮", "body": "咸鲜为骨、酱香为魂、脂香为韵，三味一体构成完整风味轮。鲜味来自鲍鱼本味+瑶柱+金华火腿的谷氨酸纳协同效应"}]}},
    {"seq": 3, "type": "content", "layout": "two_column",
     "zones": {"heading": "核心原料：鲍鱼选品标准", "kicker": "原料体系",
               "cards": [
                   {"role": "hero", "title": "南非干鲍(15-18头/斤)", "body": "肉质紧实有弹性，发制后出成率达2.8倍。干鲍比鲜鲍更适合慢炖，因干制过程中的美拉德反应赋予更深层鲜味。验收标准：色泽金黄透亮、裙边完整、干度≥92%、无霉斑无异味"},
                   {"role": "secondary", "title": "其他核心原料", "body": "• 瑶柱(80-100头/斤)：东海产，增鲜核心\n• 金华火腿(3年陈)：取上方部位，脂香浓郁\n• 花菇(直径4-5cm)：肉厚伞大，吸汁能力强\n• 凤爪：提供天然胶原蛋白，使汤汁自然挂勺\n• 猪肉排：增加肉香底味，平衡海鲜的\"飘\""},
                   {"role": "metric", "title": "原料成本占比", "chart": {"type": "big_number", "value": "62%", "label": "鲍鱼占比"}},
                   {"role": "metric", "title": "每日用量", "chart": {"type": "big_number", "value": "15", "label": "斤/日"}}]}},
    {"seq": 4, "type": "content", "layout": "mixed_grid",
     "zones": {"heading": "鲍鱼发制：7日功成一品鲍", "kicker": "预处理工艺",
               "lead": "干鲍发制周期长、环节多，每一步都影响最终口感",
               "cards": [
                   {"role": "hero", "title": "发制工艺流程", "body": "清水浸泡48h(每8h换水) → 姜葱水煮沸15min → 自然冷却至室温 → 冰水激冷浸泡24h → 高汤低温煨制72h(75°C恒定)"},
                   {"role": "secondary", "title": "Day 1-2: 清水浸发", "body": "纯净水完全浸没干鲍，冷藏环境下浸泡48h。每8h换水一次防止细菌滋生。目标：鲍鱼吸水膨胀至原体积2倍"},
                   {"role": "secondary", "title": "Day 3: 姜葱水煮制", "body": "姜片50g+葱段100g冷水下锅，煮沸后放入鲍鱼煮15min。此步骤去腥增香，同时软化肉质纤维。关火后自然冷却至室温"},
                   {"role": "secondary", "title": "Day 4: 冰水激冷", "body": "将鲍鱼捞出立即放入冰水(0-4°C)，浸泡24h。冷热交替使鲍鱼肉质产生细微裂痕，利于后续高汤渗透入味"},
                   {"role": "secondary", "title": "Day 5-7: 高汤煨制", "body": "老母鸡+猪骨+金华火腿熬制底汤，75°C恒温煨制72h。不要沸腾！沸腾会使鲍鱼表层过快熟化而内部仍硬"}]}},
    {"seq": 5, "type": "content", "layout": "timeline",
     "zones": {"heading": "煲制技法：火候的五个阶段", "kicker": "核心工艺",
               "cards": [
                   {"role": "hero", "title": "五段火候法", "body": "鲍鱼一品煲的精髓在于火候的精确控制。五段火候对应五种不同的物理化学反应阶段，每一阶段的时间、温度、状态都必须严格控制"},
                   {"role": "secondary", "title": "1. 猛火起香 (2min)", "body": "锅烧至冒青烟(200°C+)，下鸡油+猪油爆香姜葱蒜。高温触发美拉德反应，产生200+种挥发性香气化合物"},
                   {"role": "secondary", "title": "2. 中火炒酱 (3min)", "body": "转中火(150°C)下柱侯酱+花生酱+芝麻酱翻炒。酱料中的蛋白质和糖类在此温度下发生焦糖化反应，颜色加深、香气浓醇"},
                   {"role": "secondary", "title": "3. 小火炖煮 (45min)", "body": "加入高汤和所有主料，小火(85-90°C)炖煮。胶原蛋白在此温度下水解为明胶，汤汁开始变稠。不要盖锅盖——让水分适度蒸发浓缩"},
                   {"role": "secondary", "title": "4. 微火收汁 (15min)", "body": "转微火(75-80°C)，用勺子不停推动锅底防止粘锅。汤汁逐渐浓稠至\"挂勺\"状态——舀起倒下时呈连续不断的线状"},
                   {"role": "metric", "title": "总耗时", "chart": {"type": "big_number", "value": "65", "label": "分钟"}},
                   {"role": "metric", "title": "关键温度", "chart": {"type": "big_number", "value": "85", "label": "°C 小火"}}]}},
    {"seq": 6, "type": "content", "layout": "dashboard",
     "zones": {"heading": "品质控制：七大检验节点", "kicker": "品控体系",
               "cards": [
                   {"role": "metric", "title": "色泽", "chart": {"type": "big_number", "value": "棕红", "label": "透亮"}},
                   {"role": "metric", "title": "香气", "chart": {"type": "big_number", "value": "酱香", "label": "浓郁"}},
                   {"role": "metric", "title": "口感", "chart": {"type": "big_number", "value": "软糯", "label": "Q弹"}},
                   {"role": "metric", "title": "汤汁", "chart": {"type": "big_number", "value": "挂勺", "label": "浓稠"}},
                   {"role": "secondary", "title": "检验清单", "body": "1.鲍鱼用筷子可轻松穿透但不过烂\n2.汤汁自然挂勺不滴落\n3.花菇充分吸收汤汁膨胀至1.5倍\n4.凤爪脱骨但不散烂\n5.整体色泽棕红油亮无焦糊\n6.香气酱香浓郁无腥味\n7.入口软糯有弹性不粘牙"}]}},
    {"seq": 7, "type": "content", "layout": "single_focus",
     "zones": {"heading": "道：烹饪原理的底层逻辑", "kicker": "总结升华",
               "lead": "理解了\"为什么\"，才能驾驭\"怎么做\"",
               "cards": [
                   {"role": "hero", "title": "鲍鱼一品煲的道", "body": "1. 鲜味协同效应：谷氨酸(鲍鱼)+肌苷酸(瑶柱)+鸟苷酸(花菇)形成鲜味\"铁三角\"，鲜味感知强度呈指数级而非线性叠加\n2. 胶原蛋白热变性曲线：凤爪+猪排的胶原蛋白在85°C下水解速率最大，超过90°C反而交联变硬——这就是\"小火慢炖\"的科学依据\n3. 美拉德反应窗口：干鲍在干制过程中已完成初步美拉德反应，后续高温爆香和炒酱是对香气层次的二次升级\n4. 乳化与悬浮：低温长炖使脂肪微粒被明胶包裹形成稳定乳液，汤汁不油不水、浓而不腻\n\n技法的尽头是科学，科学的尽头是艺术"}]}},
]

# SOP 2: 研学PPT-AI Agent开发
sop2 = [
    {"seq": 1, "type": "cover", "layout": "full_bleed",
     "zones": {"heading": "AI Agent 开发实战", "kicker": "技术研发部", "lead": "从原理到落地的完整闭环",
               "cards": [{"role": "hero", "title": "AI Agent 开发实战",
                           "body": "大模型应用开发的技术全景图\n技术研发部 · 2026 · 技术研学文档"}]}},
    {"seq": 2, "type": "content", "layout": "hero_grid",
     "zones": {"heading": "Agent 架构全景图", "kicker": "架构设计",
               "lead": "LLM + Tools + Memory + Planning = AI Agent",
               "cards": [
                   {"role": "hero", "title": "核心架构", "body": "AI Agent由四大核心模块组成：LLM（大脑）、Tools（手脚）、Memory（记忆）、Planning（规划）。LLM负责任务理解和决策，Tools扩展模型的能力边界，Memory维护上下文和长期知识，Planning将复杂任务分解为可执行的步骤序列"},
                   {"role": "metric", "title": "LLM 推理", "chart": {"type": "big_number", "value": "4", "label": "核心模块"}},
                   {"role": "metric", "title": "Tool 调用", "chart": {"type": "big_number", "value": "12+", "label": "可用工具"}},
                   {"role": "metric", "title": "上下文窗口", "chart": {"type": "big_number", "value": "200K", "label": "tokens"}}]}},
    {"seq": 3, "type": "content", "layout": "two_column",
     "zones": {"heading": "LLM 选型：模型能力对比", "kicker": "技术选型",
               "cards": [
                   {"role": "hero", "title": "选型决策矩阵", "body": "模型选型需综合考量：推理能力(reasoning)、指令遵循(instruction following)、工具调用(function calling)、多模态(multimodal)、成本(latency+cost)五个维度。不同场景侧重不同——代码生成重推理，客服重指令遵循，数据分析重工具调用"},
                   {"role": "secondary", "title": "模型能力对比", "body": "• Claude 4 Opus: 最强推理+工具调用，适合复杂Agent\n• Claude 4 Sonnet: 性价比最优，适合生产部署\n• GPT-5: 多模态能力强，适合富媒体场景\n• DeepSeek-V4: 中文理解最优，适合国内场景\n• Gemini 3 Pro: 长上下文(2M)优势，适合文档分析"},
                   {"role": "metric", "title": "平均延迟", "chart": {"type": "big_number", "value": "1.2", "label": "秒/次"}},
                   {"role": "metric", "title": "准确率", "chart": {"type": "big_number", "value": "94.7", "label": "%"}}]}},
    {"seq": 4, "type": "content", "layout": "mixed_grid",
     "zones": {"heading": "Tool 系统设计：模型的手和脚", "kicker": "工具设计",
               "lead": "Tool是Agent能力的放大器，设计质量直接决定Agent的上限",
               "cards": [
                   {"role": "hero", "title": "Tool 设计原则", "body": "1. Single Responsibility：每个tool只做一件事\n2. Self-Descriptive：name+description让模型准确理解\n3. Type-Safe：严格的输入schema杜绝幻觉参数\n4. Idempotent：读操作可重试，写操作需确认\n5. Error-Transparent：错误信息明确告知模型以便自动修正"},
                   {"role": "secondary", "title": "Tool 类型分类", "body": "• Read Tools: 文件读取、搜索、数据库查询\n• Write Tools: 文件编辑、代码修改、数据写入\n• Execute Tools: Bash命令、API调用、脚本运行\n• Orchestrate: Agent调度、并行任务管理\n• Human-in-Loop: 审批、确认、输入采集"},
                   {"role": "metric", "title": "并发上限", "chart": {"type": "big_number", "value": "8", "label": "并行tool"}},
                   {"role": "metric", "title": "超时时间", "chart": {"type": "big_number", "value": "120", "label": "秒"}}]}},
    {"seq": 5, "type": "content", "layout": "timeline",
     "zones": {"heading": "Planning 策略：ReAct vs Plan-Execute", "kicker": "规划机制",
               "cards": [
                   {"role": "hero", "title": "规划策略演进", "body": "从简单的ReAct循环到复杂的层次化规划，Agent的规划能力决定了其处理复杂任务的上限。选择合适的规划策略需要考虑：任务复杂度、执行时长限制、错误容忍度"},
                   {"role": "secondary", "title": "1. ReAct (Reason+Act)", "body": "最基础的循环模式：思考→行动→观察→思考→...每步推理后立即执行。优点：简单可靠，错误易恢复。缺点：缺乏全局规划，长任务容易\"走偏\""},
                   {"role": "secondary", "title": "2. Plan-Execute", "body": "先制定完整计划，再逐步执行。计划包含步骤、依赖、验证点。优点：全局视角，可预估资源。缺点：灵活性差，中途变化需重新规划"},
                   {"role": "secondary", "title": "3. Hierarchical Planning", "body": "分层次规划：高层目标→中层子任务→底层操作。Agent在每个层次使用不同的策略。优点：适合超长任务链。缺点：设计复杂度高"},
                   {"role": "metric", "title": "ReAct 成功率", "chart": {"type": "big_number", "value": "78", "label": "%"}},
                   {"role": "metric", "title": "Plan-Ex 成功率", "chart": {"type": "big_number", "value": "91", "label": "%"}}]}},
    {"seq": 6, "type": "content", "layout": "three_column",
     "zones": {"heading": "Memory 系统：三种记忆类型", "kicker": "记忆机制",
               "cards": [
                   {"role": "hero", "title": "Working Memory", "body": "上下文窗口内的即时记忆。对话历史、tool调用结果、中间推理过程均在此。特点：容量受限于context window，会话结束即消失。优化：通过滑动窗口+摘要压缩延长有效记忆"},
                   {"role": "secondary", "title": "Episodic Memory", "body": "跨会话的任务记忆。记录成功/失败的案例、用户偏好、常见错误模式。实现：向量数据库存储+相似检索。特点：积累越多越智能，但需定期去噪"},
                   {"role": "secondary", "title": "Semantic Memory", "body": "结构化知识库。项目规范、API文档、最佳实践、FAQ等。实现：RAG检索增强生成。特点：数据更新即记忆更新，无需重训模型"}]}},
    {"seq": 7, "type": "content", "layout": "single_focus",
     "zones": {"heading": "落地实战：从Demo到生产", "kicker": "总结升华",
               "lead": "把Agent从\"跑得通\"升级到\"跑得稳\"",
               "cards": [
                   {"role": "hero", "title": "生产级Agent的关键要素", "body": "1. 可观测性：全链路trace+tool调用日志+token消耗监控\n2. 容错设计：tool超时重试+fallback策略+优雅降级\n3. 安全护栏：tool权限分级+敏感操作审批+输入输出审核\n4. 持续优化：用户反馈闭环+模型微调+prompt版本管理\n5. 成本控制：缓存策略+模型分层路由+批处理优化\n\nAI Agent不是一次性工程，而是持续进化的系统工程。道是架构哲学，术是落地细节。"}]}},
]

all_sops = {
    "sop1_baoyu": sop1,
    "sop2_agent": sop2,
}

PROVIDER = "0df96678"
MODEL = "deepseek-v4-pro"
BATCH = 1

out_dir = os.path.join("data", "exports", "quality_test")
os.makedirs(out_dir, exist_ok=True)

def measure_quality(svg, slide_type):
    """Check gpt54 quality features."""
    checks = {
        "grain": 'id="grain"' in svg,
        "grid_lines": 'stroke="#8DA7C5"' in svg,
        "3_glows": svg.lower().count('radialgradient') >= 3,
        "neon_glow": 'stroke-width="10"' in svg,
        "3_accent_grads": svg.lower().count('accentgrad') >= 3,
        "large_rx": 'rx="24"' in svg or 'rx="28"' in svg or 'rx="30"' in svg,
        "solid_stat_card": ('fill="url(#accentGradSecondary)"' in svg or 'fill="url(#accentGrad)"' in svg),
        "divider": 'y1="674"' in svg,
        "footer_source": 'y="694"' in svg,
        "jetbrains_numbers": 'JetBrains Mono' in svg,
        "title_underline": 'accentGradSecondary' in svg and 'width="96"' in svg,
        "summary_bar": 'y="624"' in svg or 'y="636"' in svg,
    }
    score = sum(checks.values())
    return score, checks

for sop_name, sop_slides in all_sops.items():
    print(f"\n{'='*60}")
    print(f"Generating: {sop_name} ({len(sop_slides)} slides)")
    print(f"{'='*60}")

    t0 = time.time()
    results = _stage3_svg(
        provider_id=PROVIDER, model=MODEL,
        llm_generate=llm_generate,
        slide_data=sop_slides,
        style_id="blueprint",
        batch_size=BATCH
    )
    elapsed = time.time() - t0

    if not results:
        print(f"FAILED: {sop_name}")
        continue

    total_score = 0
    max_score = 0
    for r in results:
        svg = r.get("svg_content", "")
        seq = r.get("seq", 0)
        stype = r.get("type", "content")
        score, checks = measure_quality(svg, stype)
        max_possible = len(checks)
        total_score += score
        max_score += max_possible

        passed = [k for k, v in checks.items() if v]
        failed = [k for k, v in checks.items() if not v]

        # Don't expect divider/summary_bar/footer on cover
        if stype == "cover":
            failed = [f for f in failed if f not in ("divider", "footer_source", "title_underline", "summary_bar")]

        print(f"  Slide {seq:02d} ({stype}): {score}/{max_possible} checks passed"
              f" — {len(svg)} bytes")
        if failed:
            print(f"    MISSING: {', '.join(failed)}")

        fname = f"{sop_name}_{seq:02d}.svg"
        fpath = os.path.join(out_dir, fname)
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(svg)

    print(f"  Total: {total_score}/{max_score} = {total_score/max_score*100:.0f}%")
    print(f"  Time: {elapsed:.0f}s ({elapsed/len(sop_slides):.0f}s/slide)")

print(f"\nDone. Outputs in {out_dir}")
