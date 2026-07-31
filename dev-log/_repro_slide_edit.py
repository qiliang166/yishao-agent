# 验证修复 v2：对带防复制（user-select:none + selectstart preventDefault）的真实线上 col4 产物，
# 按 applyEditableDoc（样式注入+捕获段拦停）后可正常落光标编辑；clear 后无残留。
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1500, "height": 900})
    page.goto("http://127.0.0.1:8766/api/version")
    page.evaluate("""() => {
        document.body.innerHTML = '';
        document.body.style.margin = '0';
        const f = document.createElement('iframe');
        f.id = 'pv';
        f.style.cssText = 'width:1450px;height:820px;border:none;display:block';
        f.src = '/api/exports/_repro_col4fz_prod/index.html?_t=0';
        document.body.appendChild(f);
    }""")
    page.wait_for_timeout(2500)
    fr = page.frames[-1]
    fr.wait_for_load_state()

    # 与 frontend/src/utils/editableDoc.ts applyEditableDoc 同逻辑
    page.evaluate("""() => {
        const doc = document.getElementById('pv').contentDocument;
        doc.body.setAttribute('contenteditable', 'true');
        doc.body.style.cursor = 'text';
        if (!doc.getElementById('__ys_editfix')) {
            const st = doc.createElement('style');
            st.id = '__ys_editfix';
            st.textContent = '* { -webkit-user-select: text !important; user-select: text !important; }';
            (doc.head || doc.documentElement).appendChild(st);
        }
        const stopper = (e) => { e.stopImmediatePropagation(); };
        window.__stopper = stopper;
        for (const t of ['selectstart','copy','contextmenu','dragstart']) doc.addEventListener(t, stopper, true);
    }""")

    # 目标：第2页里最长的一段正文（找不到则退全档）
    fr.evaluate("""() => {
        const pick = (root) => Array.from(root.querySelectorAll('div,span,p,td,li'))
            .filter(e => e.children.length === 0 && (e.textContent||'').trim().length > 6);
        let els = pick(document.querySelectorAll('.slide-wrapper')[1] || document.body);
        if (!els.length) els = pick(document.body);
        els.sort((a,b) => b.textContent.length - a.textContent.length);
        const el = els[0];
        el.setAttribute('data-repro-target','1');
        el.scrollIntoView({block:'center'});
    }""")
    page.wait_for_timeout(400)
    pos = page.evaluate("""() => {
        const f = document.getElementById('pv');
        const fr = f.getBoundingClientRect();
        const r = f.contentDocument.querySelector('[data-repro-target]').getBoundingClientRect();
        return { x: fr.x + r.x + Math.min(60, r.width/2), y: fr.y + r.y + r.height/2 };
    }""")
    page.mouse.click(pos["x"], pos["y"])
    page.wait_for_timeout(300)
    caret = fr.evaluate("""() => {
        const sel = document.getSelection();
        return sel.rangeCount ? (sel.anchorNode.textContent||'').trim().slice(0,30) : 'NO-RANGE';
    }""")
    before = fr.evaluate("document.querySelector('[data-repro-target]').textContent").strip()
    page.keyboard.type("XYZ测试")
    page.wait_for_timeout(200)
    after = fr.evaluate("document.querySelector('[data-repro-target]').textContent").strip()
    print("1) 光标锚点文本:", caret)
    print("2) 目标 修改前:", before[:40])
    print("3) 目标 修改后:", after[:40])
    print("4) 编辑生效:", "XYZ" in after)

    # 划选一段并 execCommand bold（工具栏路径）
    sel_ok = fr.evaluate("""() => {
        const el = document.querySelector('[data-repro-target]');
        const rng = document.createRange();
        rng.selectNodeContents(el);
        const sel = document.getSelection();
        sel.removeAllRanges(); sel.addRange(rng);
        return !sel.isCollapsed;
    }""")
    print("5) 可整段选中:", sel_ok)

    # 与 clearEditableDoc 同逻辑
    page.evaluate("""() => {
        const doc = document.getElementById('pv').contentDocument;
        doc.body.removeAttribute('contenteditable');
        doc.body.style.cursor = '';
        if (!doc.body.getAttribute('style')) doc.body.removeAttribute('style');
        const st = doc.getElementById('__ys_editfix');
        if (st) st.remove();
        for (const t of ['selectstart','copy','contextmenu','dragstart']) doc.removeEventListener(t, window.__stopper, true);
    }""")
    residue = fr.evaluate("""() => ({
        editfixStyle: !!document.getElementById('__ys_editfix'),
        bodyEditable: document.body.hasAttribute('contenteditable'),
        bodyStyleAttr: document.body.getAttribute('style'),
        htmlHasEditfix: document.documentElement.outerHTML.includes('__ys_editfix'),
    })""")
    print("6) 剥离后残留:", residue)
    # 剥离后防复制恢复：再点击应无法选中
    page.mouse.click(pos["x"], pos["y"])
    page.wait_for_timeout(200)
    resel = fr.evaluate("""() => {
        const el = document.querySelector('[data-repro-target]');
        const rng = document.createRange();
        rng.selectNodeContents(el);
        const sel = document.getSelection();
        sel.removeAllRanges();
        try { sel.addRange(rng); } catch(e) {}
        return getComputedStyle(el).userSelect;
    }""")
    print("7) 剥离后 userSelect 恢复为:", resel)
    b.close()
