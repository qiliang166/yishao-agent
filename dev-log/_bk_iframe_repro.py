# 136页bug复现：同一份翻页式产物，在"新挂载iframe(srcdoc即设)"与"已布局iframe再设srcdoc"两种场景下的拆页数对比
from pathlib import Path
from playwright.sync_api import sync_playwright

html = Path(__file__).with_name("_bk_sample_a4.html").read_text(encoding="utf-8")

def count_sheets(page, label):
    fr = page.frames[-1]
    fr.wait_for_load_state()
    page.wait_for_timeout(600)
    n = fr.evaluate("document.querySelectorAll('.bk-sheet').length")
    ones = fr.evaluate("""Array.prototype.filter.call(
        document.querySelectorAll('.bk-sheet .bk-prose'),
        p => p.children.length <= 1).length""")
    print(f"{label}: sheets={n}  单块正文页={ones}")
    return n

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1200, "height": 800})

    # 场景A：模拟 React 首次挂载 —— 同一同步任务里 创建iframe+设srcdoc+插入DOM
    page.goto("about:blank")
    page.evaluate("""(html) => {
        const d = document.createElement('div');
        d.style.cssText = 'width:900px;height:600px;overflow:hidden';
        const f = document.createElement('iframe');
        f.style.cssText = 'width:100%;height:100%;border:none';
        f.setAttribute('sandbox', 'allow-scripts');
        f.srcdoc = html;
        d.appendChild(f);
        document.body.appendChild(d);
    }""", html)
    a = count_sheets(page, "A 新挂载iframe(srcdoc即设)")

    # 场景B：iframe 先挂载完成布局，两帧后再设 srcdoc（对应先预览过其他方式）
    page.goto("about:blank")
    page.evaluate("""() => {
        const d = document.createElement('div');
        d.style.cssText = 'width:900px;height:600px;overflow:hidden';
        const f = document.createElement('iframe');
        f.id = 'pv';
        f.style.cssText = 'width:100%;height:100%;border:none';
        f.setAttribute('sandbox', 'allow-scripts');
        d.appendChild(f);
        document.body.appendChild(d);
    }""")
    page.wait_for_timeout(300)
    page.evaluate("(html) => { document.getElementById('pv').srcdoc = html }", html)
    b2 = count_sheets(page, "B 已布局iframe再设srcdoc")

    # 场景C：独立打开（基准）
    page.goto("about:blank")
    page.set_content(html)
    page.wait_for_timeout(600)
    c = page.evaluate("document.querySelectorAll('.bk-sheet').length")
    print(f"C 独立打开基准: sheets={c}")

    b.close()
    print("RESULT:", "REPRODUCED" if a != b2 or a != c else "not reproduced")
