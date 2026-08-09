"""License key manager GUI for Yishao Agent.
Connects to activation server: generate, suspend, resume, set expiry, set notes, revoke,
site config (pricing & announcement), plan types, payment QR codes, order management.
"""
import json
import os
import sys
import tkinter as tk
from io import BytesIO
from tkinter import ttk, messagebox, filedialog
import urllib.request
import urllib.error
from PIL import Image, ImageTk


STATUS_LABELS = {
    "submitted": "待付款",
    "payment_pending": "已付款待审核",
    "paid_confirming": "审核中",
    "completed": "已完成",
    "cancelled": "已驳回",
    "expired": "已过期",
}


class KeyGenApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Yishao Agent — 注册码管理器")
        self.root.resizable(True, True)
        w, h = 1200, 780
        ws = root.winfo_screenwidth()
        hs = root.winfo_screenheight()
        x = (ws - w) // 2
        y = (hs - h) // 2
        root.geometry(f"{w}x{h}+{x}+{y}")
        root.minsize(960, 600)
        self._all_keys = []
        self._all_plans = []
        self._all_orders = []
        self._orders_auto_refresh = None
        if getattr(sys, 'frozen', False):
            _cfg_dir = os.path.dirname(sys.executable)
        else:
            _cfg_dir = os.path.dirname(os.path.abspath(__file__))
        self._config_path = os.path.join(_cfg_dir, "keygen_config.json")
        self._build_ui()
        self._load_local_config()

    def _load_local_config(self):
        try:
            if os.path.exists(self._config_path):
                with open(self._config_path, 'r', encoding='utf-8') as f:
                    cfg = json.load(f)
                if cfg.get("server_url"):
                    self.server_url.set(cfg["server_url"])
                if cfg.get("admin_token"):
                    self.admin_token.set(cfg["admin_token"])
        except Exception:
            pass

    def _save_local_config(self):
        try:
            with open(self._config_path, 'w', encoding='utf-8') as f:
                json.dump({
                    "server_url": self.server_url.get().strip(),
                    "admin_token": self.admin_token.get().strip(),
                }, f, ensure_ascii=False, indent=2)
            self.status_var.set("连接信息已保存到本地")
        except Exception as e:
            self.status_var.set(f"保存本地配置失败: {e}")

    def _on_tab_changed(self, event):
        selected = self.notebook.tab(self.notebook.select(), "text")
        if selected == "站点配置":
            self.root.after(100, lambda: self._load_site_config(silent=True))

    def _add_context_menu(self, widget):
        """Add right-click context menu (Cut/Copy/Paste/Select All) to a widget."""
        menu = tk.Menu(widget, tearoff=0)
        is_text = isinstance(widget, tk.Text)
        is_entry = isinstance(widget, ttk.Entry)

        def _cut():
            try:
                if is_text:
                    widget.event_generate("<<Cut>>")
                elif is_entry:
                    widget.event_generate("<<Cut>>")
            except Exception:
                pass

        def _copy():
            try:
                if is_text:
                    widget.event_generate("<<Copy>>")
                elif is_entry:
                    widget.event_generate("<<Copy>>")
            except Exception:
                pass

        def _paste():
            try:
                if is_text:
                    widget.event_generate("<<Paste>>")
                elif is_entry:
                    widget.event_generate("<<Paste>>")
            except Exception:
                pass

        def _select_all():
            try:
                if is_text:
                    widget.tag_add("sel", "1.0", "end")
                elif is_entry:
                    widget.select_range(0, "end")
            except Exception:
                pass

        menu.add_command(label="剪切", command=_cut, accelerator="Ctrl+X")
        menu.add_command(label="复制", command=_copy, accelerator="Ctrl+C")
        menu.add_command(label="粘贴", command=_paste, accelerator="Ctrl+V")
        menu.add_separator()
        menu.add_command(label="全选", command=_select_all, accelerator="Ctrl+A")

        def _show_menu(event):
            try:
                menu.tk_popup(event.x_root, event.y_root)
            finally:
                menu.grab_release()

        widget.bind("<Button-3>", _show_menu)
        # Also handle the context menu key on Windows
        widget.bind("<Button-2>", _show_menu)

        # Store reference to prevent garbage collection
        widget._context_menu = menu

    def _bind_all_context_menus(self):
        """Recursively walk all widgets and add context menus to Entry/Text."""
        def _walk(w):
            if isinstance(w, (ttk.Entry, tk.Entry, tk.Text)):
                self._add_context_menu(w)
            for child in w.winfo_children():
                _walk(child)
        _walk(self.root)

    def _call_api(self, method: str, path: str, body: dict | None = None) -> dict:
        token = self.admin_token.get().strip()
        server = self.server_url.get().strip().rstrip("/")
        if not token:
            raise ValueError("请输入管理令牌")
        if not server:
            raise ValueError("请输入服务器地址")

        data = json.dumps(body).encode("utf-8") if body else None
        req = urllib.request.Request(
            f"{server}{path}",
            data=data,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method=method,
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _upload_file(self, path: str, filepath: str, field_name: str) -> dict:
        token = self.admin_token.get().strip()
        server = self.server_url.get().strip().rstrip("/")
        if not token or not server:
            raise ValueError("请先配置服务器连接")

        boundary = "----YishaoKeyGenBoundary"
        filename = os.path.basename(filepath)
        with open(filepath, "rb") as f:
            file_data = f.read()

        body = bytearray()
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode())
        body.extend(b"Content-Type: application/octet-stream\r\n\r\n")
        body.extend(file_data)
        body.extend(f"\r\n--{boundary}--\r\n".encode())

        req = urllib.request.Request(
            f"{server}{path}",
            data=bytes(body),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="PUT",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _build_ui(self):
        ttk.Label(self.root, text="Yishao Agent 注册码管理器",
                  font=("Microsoft YaHei UI", 14, "bold")).pack(pady=(16, 2))
        ttk.Label(self.root, text="注册码 / 站点配置 / 品牌信息 / 套餐 / 收款码 / 订单管理",
                  font=("Microsoft YaHei UI", 9)).pack(pady=(0, 12))

        # ── Server config ──
        cfg = ttk.LabelFrame(self.root, text="服务器连接", padding=8)
        cfg.pack(fill="x", padx=12, pady=(0, 8))

        row1 = ttk.Frame(cfg); row1.pack(fill="x", pady=(0, 4))
        ttk.Label(row1, text="地址：", width=8).pack(side="left")
        self.server_url = tk.StringVar(value="http://localhost:18777")
        ttk.Entry(row1, textvariable=self.server_url, font=("Consolas", 9)).pack(side="right", expand=True, fill="x")

        row2 = ttk.Frame(cfg); row2.pack(fill="x")
        ttk.Label(row2, text="令牌：", width=8).pack(side="left")
        self.admin_token = tk.StringVar()
        self._token_showing = False
        self._token_entry = ttk.Entry(row2, textvariable=self.admin_token, font=("Consolas", 9), show="*")
        self._token_entry.pack(side="right", expand=True, fill="x", padx=(0, 4))
        self._token_eye = ttk.Button(row2, text="显示", width=5, command=self._toggle_token_vis)
        self._token_eye.pack(side="right")

        save_row = ttk.Frame(cfg); save_row.pack(fill="x", pady=(4, 0))
        ttk.Button(save_row, text="保存连接信息到本地", command=self._save_local_config).pack(side="left")
        ttk.Label(save_row, text="  下次打开自动回填地址和令牌",
                  foreground="gray", font=("Microsoft YaHei UI", 8)).pack(side="left")

        # ── Notebook tabs ──
        self.notebook = ttk.Notebook(self.root)
        self.notebook.bind("<<NotebookTabChanged>>", self._on_tab_changed)
        self.notebook.pack(fill="both", expand=True, padx=12, pady=(0, 8))

        self._build_key_tab()
        self._build_site_config_tab()
        self._build_brand_tab()
        self._build_plan_tab()
        self._build_qrcode_tab()
        self._build_order_tab()

        self._bind_all_context_menus()

        # Status bar
        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(self.root, textvariable=self.status_var, font=("Microsoft YaHei UI", 8),
                  foreground="gray").pack(side="bottom", anchor="w", padx=12, pady=(0, 8))

    # ═══════════════════════════════════════════════════════════════
    # Tab 1: Key Management
    # ═══════════════════════════════════════════════════════════════

    def _build_key_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="注册码管理")

        gen_frame = ttk.LabelFrame(tab, text="生成新注册码", padding=8)
        gen_frame.pack(fill="x", pady=(8, 8))

        gen_row0 = ttk.Frame(gen_frame); gen_row0.pack(fill="x")
        ttk.Label(gen_row0, text="关联订单：", width=10).pack(side="left")
        self.order_no_var = tk.StringVar(value="")
        ttk.Entry(gen_row0, textvariable=self.order_no_var, font=("Consolas", 9), width=26).pack(side="left", padx=(0, 8))
        ttk.Label(gen_row0, text="(可选) 填入订单号，自动回填手机和到期时间", foreground="gray",
                  font=("Microsoft YaHei UI", 8)).pack(side="left")

        gen_row1 = ttk.Frame(gen_frame); gen_row1.pack(fill="x", pady=(4, 0))
        ttk.Label(gen_row1, text="到期时间：", width=10).pack(side="left")
        self.expiry_var = tk.StringVar(value="")
        ttk.Entry(gen_row1, textvariable=self.expiry_var, font=("Consolas", 9), width=22).pack(side="left", padx=(0, 8))
        ttk.Label(gen_row1, text="留空=永久  格式: 2026-12-31 23:59:59", foreground="gray",
                  font=("Microsoft YaHei UI", 8)).pack(side="left")

        gen_row2 = ttk.Frame(gen_frame); gen_row2.pack(fill="x", pady=(4, 0))
        ttk.Label(gen_row2, text="手机：", width=10).pack(side="left")
        self.phone_var = tk.StringVar(value="")
        ttk.Entry(gen_row2, textvariable=self.phone_var, font=("Consolas", 9), width=18).pack(side="left", padx=(0, 12))
        ttk.Label(gen_row2, text="备注：", width=6).pack(side="left")
        self.note_var = tk.StringVar(value="")
        ttk.Entry(gen_row2, textvariable=self.note_var, font=("Consolas", 9)).pack(side="right", expand=True, fill="x")

        btn_row = ttk.Frame(gen_frame); btn_row.pack(fill="x", pady=(6, 0))
        self.gen_btn = ttk.Button(btn_row, text="生成注册码", command=self._generate)
        self.gen_btn.pack(side="left")
        ttk.Button(btn_row, text="查询订单回填", command=self._lookup_order).pack(side="left", padx=(8, 0))

        self.output = tk.Text(tab, height=2, font=("Consolas", 10),
                              bg="#1e1e1e", fg="#4ec94e", relief="flat", borderwidth=1,
                              highlightthickness=1, highlightbackground="#555", padx=10, pady=8)
        self.output.pack(fill="x", pady=(0, 4))
        self.output.insert("1.0", "点击[生成注册码]...")
        self.output.configure(state="disabled")

        cp_frame = ttk.Frame(tab); cp_frame.pack(fill="x", pady=(0, 8))
        self.copy_btn = ttk.Button(cp_frame, text="复制注册码", command=self._copy)
        self.copy_btn.pack(side="left")

        # Search bar
        search_frame = ttk.Frame(tab); search_frame.pack(fill="x", pady=(0, 4))
        ttk.Label(search_frame, text="手机搜索：",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(0, 6))
        self.search_var = tk.StringVar()
        self.search_entry = ttk.Entry(search_frame, textvariable=self.search_var,
                                       font=("Consolas", 9), width=16)
        self.search_entry.pack(side="left", padx=(0, 4))
        self.search_entry.bind("<KeyRelease>", lambda e: self._apply_filter())
        ttk.Button(search_frame, text="清除", width=5,
                   command=self._clear_search).pack(side="left")

        # Key list
        ttk.Label(tab, text="所有注册码（单击选中后可操作）：",
                  font=("Microsoft YaHei UI", 9, "bold")).pack(anchor="w", pady=(0, 2))

        tree_frame = ttk.Frame(tab); tree_frame.pack(fill="both", expand=True, pady=(0, 4))
        columns = ("sn", "license_key", "status", "phone", "notes", "expires", "created")
        self.tree = ttk.Treeview(tree_frame, columns=columns, show="headings", height=8)
        self.tree.heading("sn", text="序列号", anchor="center")
        self.tree.heading("license_key", text="注册码", anchor="center")
        self.tree.heading("status", text="状态", anchor="center")
        self.tree.heading("phone", text="手机", anchor="center")
        self.tree.heading("notes", text="备注", anchor="center")
        self.tree.heading("expires", text="到期时间", anchor="center")
        self.tree.heading("created", text="创建时间", anchor="center")
        self.tree.column("sn", width=60, anchor="center")
        self.tree.column("license_key", width=240, anchor="center")
        self.tree.column("status", width=70, anchor="center")
        self.tree.column("phone", width=110, anchor="center")
        self.tree.column("notes", width=130, anchor="center")
        self.tree.column("expires", width=120, anchor="center")
        self.tree.column("created", width=120, anchor="center")

        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Action buttons
        act_frame = ttk.Frame(tab); act_frame.pack(fill="x", pady=(0, 4))
        ttk.Label(act_frame, text="选中后操作：", font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(0, 6))
        self.list_btn = ttk.Button(act_frame, text="刷新列表", command=self._list_keys)
        self.list_btn.pack(side="left", padx=(0, 3))
        self.copy_key_btn = ttk.Button(act_frame, text="复制选中", command=self._copy_selected_key)
        self.copy_key_btn.pack(side="left", padx=(0, 3))
        self.phone_btn = ttk.Button(act_frame, text="编辑手机", command=self._edit_phone)
        self.phone_btn.pack(side="left", padx=(0, 3))
        self.view_note_btn = ttk.Button(act_frame, text="查看备注", command=self._view_notes)
        self.view_note_btn.pack(side="left", padx=(0, 3))
        self.note_btn = ttk.Button(act_frame, text="编辑备注", command=self._edit_notes)
        self.note_btn.pack(side="left", padx=(0, 3))
        self.suspend_btn = ttk.Button(act_frame, text="暂停/恢复", command=self._toggle_suspend)
        self.suspend_btn.pack(side="left", padx=(0, 3))
        self.expiry_btn = ttk.Button(act_frame, text="修改到期", command=self._set_expiry)
        self.expiry_btn.pack(side="left", padx=(0, 3))
        self.revoke_btn = ttk.Button(act_frame, text="吊销", command=self._revoke)
        self.revoke_btn.pack(side="left")

    # ═══════════════════════════════════════════════════════════════
    # Tab 2: Site Config
    # ═══════════════════════════════════════════════════════════════

    def _build_site_config_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="站点配置")

        announce_frame = ttk.LabelFrame(tab, text="公告弹窗（管理员/会员登录后自动弹出）", padding=8)
        announce_frame.pack(fill="x", padx=0, pady=(0, 8))

        toggle_row = ttk.Frame(announce_frame); toggle_row.pack(fill="x", pady=(0, 4))
        self.announce_enabled_var = tk.BooleanVar(value=False)
        self._announce_cb = ttk.Checkbutton(toggle_row, text="启用公告弹窗",
                                             variable=self.announce_enabled_var)
        self._announce_cb.pack(side="left")
        self.announce_enabled_status = tk.StringVar()
        ttk.Label(toggle_row, textvariable=self.announce_enabled_status, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        info2 = ttk.Frame(announce_frame); info2.pack(fill="x", pady=(4, 4))
        ttk.Label(info2, text="支持 HTML 格式。开关打开且有内容时，用户登录后弹出公告，关闭后当天不再显示。",
                  foreground="gray", font=("Microsoft YaHei UI", 8)).pack(anchor="w")

        self.announce_text = tk.Text(announce_frame, height=4, font=("Consolas", 10),
                                     relief="flat", borderwidth=1, highlightthickness=1,
                                     highlightbackground="#ccc", padx=8, pady=6)
        self.announce_text.pack(fill="x")

        btn_row2 = ttk.Frame(announce_frame); btn_row2.pack(fill="x", pady=(6, 0))
        ttk.Button(btn_row2, text="加载当前设置", command=self._load_site_config).pack(side="left", padx=(0, 8))
        ttk.Button(btn_row2, text="保存公告", command=self._save_announce).pack(side="left")
        self.announce_status = tk.StringVar()
        ttk.Label(btn_row2, textvariable=self.announce_status, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        purchase_frame = ttk.LabelFrame(tab, text="购买功能开关", padding=8)
        purchase_frame.pack(fill="x", padx=0, pady=(8, 0))

        purchase_row = ttk.Frame(purchase_frame); purchase_row.pack(fill="x")
        self.purchase_enabled_var = tk.BooleanVar(value=False)
        self._purchase_cb = ttk.Checkbutton(purchase_row, text="启用购买软件功能",
                                             variable=self.purchase_enabled_var)
        self._purchase_cb.pack(side="left")
        self.purchase_status = tk.StringVar()
        ttk.Label(purchase_row, textvariable=self.purchase_status, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        purchase_info = ttk.Frame(purchase_frame); purchase_info.pack(fill="x", pady=(4, 0))
        ttk.Label(purchase_info, text="关闭后，用户单击「购买软件」将提示功能暂未开放，不会进入付款页面。",
                  foreground="gray", font=("Microsoft YaHei UI", 8)).pack(anchor="w")

        purchase_btn = ttk.Frame(purchase_frame); purchase_btn.pack(fill="x", pady=(8, 0))
        ttk.Button(purchase_btn, text="保存开关", command=self._save_purchase).pack(side="left")

        download_frame = ttk.LabelFrame(tab, text="下载链接（左侧栏「下载桌面版」「下载服务器版」）", padding=8)
        download_frame.pack(fill="x", padx=0, pady=(8, 0))

        d_row1 = ttk.Frame(download_frame); d_row1.pack(fill="x", pady=(0, 4))
        ttk.Label(d_row1, text="桌面版：", width=10).pack(side="left")
        self.download_desktop_var = tk.StringVar()
        ttk.Entry(d_row1, textvariable=self.download_desktop_var, font=("Consolas", 10)).pack(side="left", fill="x", expand=True)
        ttk.Label(d_row1, text="  留空则使用默认 /api/download/desktop",
                  foreground="gray", font=("Microsoft YaHei UI", 8)).pack(side="left")

        d_row2 = ttk.Frame(download_frame); d_row2.pack(fill="x", pady=(0, 4))
        ttk.Label(d_row2, text="服务器版：", width=10).pack(side="left")
        self.download_server_var = tk.StringVar()
        ttk.Entry(d_row2, textvariable=self.download_server_var, font=("Consolas", 10)).pack(side="left", fill="x", expand=True)
        ttk.Label(d_row2, text="  留空则使用默认 /api/download/server",
                  foreground="gray", font=("Microsoft YaHei UI", 8)).pack(side="left")

        d_btn_row = ttk.Frame(download_frame); d_btn_row.pack(fill="x", pady=(6, 0))
        ttk.Button(d_btn_row, text="保存下载链接", command=self._save_download_urls).pack(side="left")
        self.download_status = tk.StringVar()
        ttk.Label(d_btn_row, textvariable=self.download_status, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

    # ═══════════════════════════════════════════════════════════════
    # Tab 3: Brand Info（品牌信息）
    # ═══════════════════════════════════════════════════════════════

    def _build_brand_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="品牌信息")

        # Brand name + logo
        row1 = ttk.Frame(tab); row1.pack(fill="x", padx=8, pady=(8, 4))
        ttk.Label(row1, text="应用名称：", width=12).pack(side="left")
        self.brand_name_var = tk.StringVar()
        ttk.Entry(row1, textvariable=self.brand_name_var, font=("Microsoft YaHei UI", 10)).pack(side="left", fill="x", expand=True)

        row1b = ttk.Frame(tab); row1b.pack(fill="x", padx=8, pady=(0, 4))
        ttk.Label(row1b, text="LOGO URL：", width=12).pack(side="left")
        self.brand_logo_var = tk.StringVar()
        ttk.Entry(row1b, textvariable=self.brand_logo_var, font=("Consolas", 10)).pack(side="left", fill="x", expand=True)
        self._logo_photo = None
        self.logo_preview_label = ttk.Label(row1b)
        self.logo_preview_label.pack(side="left", padx=(4, 0))
        self.brand_logo_var.trace_add("write", lambda *_: self._update_logo_preview())
        ttk.Button(row1b, text="本地上传", command=self._upload_logo).pack(side="left", padx=(4, 0))

        # Slogan + version
        row2 = ttk.Frame(tab); row2.pack(fill="x", padx=8, pady=(0, 4))
        ttk.Label(row2, text="口号：", width=12).pack(side="left")
        self.branding_slogan_var = tk.StringVar()
        ttk.Entry(row2, textvariable=self.branding_slogan_var, font=("Microsoft YaHei UI", 10)).pack(side="left", fill="x", expand=True)

        row2b = ttk.Frame(tab); row2b.pack(fill="x", padx=8, pady=(0, 4))
        ttk.Label(row2b, text="版本号：", width=12).pack(side="left")
        self.app_version_var = tk.StringVar()
        ttk.Entry(row2b, textvariable=self.app_version_var, font=("Consolas", 10), width=15).pack(side="left")

        # Copyright + signature
        row3 = ttk.Frame(tab); row3.pack(fill="x", padx=8, pady=(0, 4))
        ttk.Label(row3, text="版权信息：", width=12).pack(side="left")
        self.branding_copyright_var = tk.StringVar()
        ttk.Entry(row3, textvariable=self.branding_copyright_var, font=("Microsoft YaHei UI", 10)).pack(side="left", fill="x", expand=True)

        row3b = ttk.Frame(tab); row3b.pack(fill="x", padx=8, pady=(0, 4))
        ttk.Label(row3b, text="签名/作者：", width=12).pack(side="left")
        self.branding_signature_var = tk.StringVar()
        ttk.Entry(row3b, textvariable=self.branding_signature_var, font=("Microsoft YaHei UI", 10)).pack(side="left", fill="x", expand=True)

        # About content
        about_frame = ttk.LabelFrame(tab, text="软件介绍（展示在「关于软件」弹窗中）", padding=8)
        about_frame.pack(fill="both", expand=True, padx=8, pady=(8, 4))
        self.about_text = tk.Text(about_frame, height=5, font=("Microsoft YaHei UI", 10),
                                  relief="flat", borderwidth=1, highlightthickness=1,
                                  highlightbackground="#ccc", padx=8, pady=6, wrap="word")
        self.about_text.pack(fill="both", expand=True)

        # Buttons
        btn_row = ttk.Frame(tab); btn_row.pack(fill="x", padx=8, pady=(0, 8))
        ttk.Button(btn_row, text="加载当前设置", command=self._load_brand_info).pack(side="left", padx=(0, 8))
        ttk.Button(btn_row, text="保存品牌信息", command=self._save_brand_info).pack(side="left")
        self.brand_status_var = tk.StringVar()
        ttk.Label(btn_row, textvariable=self.brand_status_var, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        note_row = ttk.Frame(tab); note_row.pack(fill="x", padx=8)
        ttk.Label(note_row, text="品牌信息统一由注册码管理器设置，软件内不可修改。修改后用户需重启软件生效。",
                  foreground="gray", font=("Microsoft YaHei UI", 8)).pack(anchor="w")

    # ═══════════════════════════════════════════════════════════════
    # Tab 4: Plan Types
    # ═══════════════════════════════════════════════════════════════

    def _build_plan_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="套餐配置")

        btn_row = ttk.Frame(tab); btn_row.pack(fill="x", pady=(8, 4))
        ttk.Button(btn_row, text="刷新", command=self._list_plans).pack(side="left", padx=(0, 8))
        ttk.Button(btn_row, text="新增套餐", command=self._add_plan).pack(side="left")
        self.plan_status_var = tk.StringVar()
        ttk.Label(btn_row, textvariable=self.plan_status_var, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        columns = ("id", "name", "price", "duration", "status", "sort")
        self.plan_tree = ttk.Treeview(tab, columns=columns, show="headings", height=10)
        self.plan_tree.heading("id", text="ID", anchor="center")
        self.plan_tree.heading("name", text="套餐名称", anchor="center")
        self.plan_tree.heading("price", text="价格(元)", anchor="center")
        self.plan_tree.heading("duration", text="有效期", anchor="center")
        self.plan_tree.heading("status", text="状态", anchor="center")
        self.plan_tree.heading("sort", text="排序", anchor="center")
        self.plan_tree.column("id", width=40, anchor="center")
        self.plan_tree.column("name", width=150, anchor="center")
        self.plan_tree.column("price", width=80, anchor="center")
        self.plan_tree.column("duration", width=100, anchor="center")
        self.plan_tree.column("status", width=60, anchor="center")
        self.plan_tree.column("sort", width=50, anchor="center")
        self.plan_tree.pack(fill="both", expand=True, pady=(0, 4))

        act_row = ttk.Frame(tab); act_row.pack(fill="x")
        ttk.Button(act_row, text="编辑", command=self._edit_plan).pack(side="left", padx=(0, 6))
        ttk.Button(act_row, text="启用/禁用", command=self._toggle_plan_active).pack(side="left", padx=(0, 6))
        ttk.Button(act_row, text="删除", command=self._delete_plan).pack(side="left", padx=(0, 6))
        ttk.Button(act_row, text="上移", command=lambda: self._move_plan(-1)).pack(side="left", padx=(0, 6))
        ttk.Button(act_row, text="下移", command=lambda: self._move_plan(1)).pack(side="left")

        self.plan_tree.bind("<Double-1>", lambda e: self._edit_plan())

    # ═══════════════════════════════════════════════════════════════
    # Tab 5: Payment QR Codes
    # ═══════════════════════════════════════════════════════════════

    def _build_qrcode_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="收款码配置")

        # WeChat
        wx_frame = ttk.LabelFrame(tab, text="微信收款码", padding=8)
        wx_frame.pack(fill="x", padx=0, pady=(8, 8))

        wx_row = ttk.Frame(wx_frame); wx_row.pack(fill="x")
        self.wx_preview_label = ttk.Label(wx_row, text="(未上传)")
        self.wx_preview_label.pack(side="left", padx=(0, 12))
        ttk.Button(wx_row, text="选择文件上传", command=lambda: self._upload_qr("wechat_qr")).pack(side="left")
        self.wx_status_var = tk.StringVar()
        ttk.Label(wx_row, textvariable=self.wx_status_var, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        # Alipay
        ali_frame = ttk.LabelFrame(tab, text="支付宝收款码", padding=8)
        ali_frame.pack(fill="x", padx=0, pady=(0, 8))

        ali_row = ttk.Frame(ali_frame); ali_row.pack(fill="x")
        self.ali_preview_label = ttk.Label(ali_row, text="(未上传)")
        self.ali_preview_label.pack(side="left", padx=(0, 12))
        ttk.Button(ali_row, text="选择文件上传", command=lambda: self._upload_qr("alipay_qr")).pack(side="left")
        self.ali_status_var = tk.StringVar()
        ttk.Label(ali_row, textvariable=self.ali_status_var, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        ttk.Button(tab, text="加载当前收款码", command=self._load_qrcodes).pack(anchor="w", pady=(0, 8))

        # Store photo references for preview
        self._qr_photos = {}

    # ═══════════════════════════════════════════════════════════════
    # Tab 6: Order Management
    # ═══════════════════════════════════════════════════════════════

    def _build_order_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="订单管理")

        top_row = ttk.Frame(tab); top_row.pack(fill="x", pady=(8, 4))
        ttk.Label(top_row, text="状态筛选：", font=("Microsoft YaHei UI", 9)).pack(side="left")
        self.order_filter_var = tk.StringVar(value="")
        filter_combo = ttk.Combobox(top_row, textvariable=self.order_filter_var,
                                    values=["", "submitted", "payment_pending", "completed", "cancelled", "expired"],
                                    state="readonly", width=12)
        filter_combo.pack(side="left", padx=(4, 8))
        filter_combo.bind("<<ComboboxSelected>>", lambda e: self._list_orders())

        self.order_count_var = tk.StringVar(value="")
        ttk.Label(top_row, textvariable=self.order_count_var, foreground="gray",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        columns = ("id", "order_no", "phone", "plan", "amount", "status", "ref", "key_sn", "time")
        self.order_tree = ttk.Treeview(tab, columns=columns, show="headings", height=12)
        self.order_tree.heading("id", text="ID", anchor="center")
        self.order_tree.heading("order_no", text="订单号", anchor="center")
        self.order_tree.heading("phone", text="手机号", anchor="center")
        self.order_tree.heading("plan", text="套餐", anchor="center")
        self.order_tree.heading("amount", text="金额", anchor="center")
        self.order_tree.heading("status", text="状态", anchor="center")
        self.order_tree.heading("ref", text="付款参考号", anchor="center")
        self.order_tree.heading("key_sn", text="密钥SN", anchor="center")
        self.order_tree.heading("time", text="提交时间", anchor="center")
        self.order_tree.column("id", width=40, anchor="center")
        self.order_tree.column("order_no", width=100, anchor="center")
        self.order_tree.column("phone", width=100, anchor="center")
        self.order_tree.column("plan", width=100, anchor="center")
        self.order_tree.column("amount", width=60, anchor="center")
        self.order_tree.column("status", width=90, anchor="center")
        self.order_tree.column("ref", width=110, anchor="center")
        self.order_tree.column("key_sn", width=60, anchor="center")
        self.order_tree.column("time", width=130, anchor="center")
        self.order_tree.pack(fill="both", expand=True)

        self.order_tree.bind("<Double-1>", lambda e: self._view_order_detail())

        act_row = ttk.Frame(tab); act_row.pack(fill="x", pady=(4, 0))
        ttk.Button(act_row, text="刷新", command=self._list_orders).pack(side="left", padx=(0, 6))
        ttk.Button(act_row, text="确认收款", command=self._verify_order).pack(side="left", padx=(0, 6))
        ttk.Button(act_row, text="驳回", command=self._reject_order).pack(side="left", padx=(0, 6))
        ttk.Button(act_row, text="查看详情", command=self._view_order_detail).pack(side="left", padx=(0, 6))
        ttk.Button(act_row, text="编辑备注", command=self._edit_order_notes).pack(side="left")
        self.order_status_var = tk.StringVar()
        ttk.Label(act_row, textvariable=self.order_status_var, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        # Start auto-refresh
        self._schedule_order_refresh()

    # ── Helpers ──────────────────────────────────────────────────

    def _toggle_token_vis(self):
        self._token_showing = not self._token_showing
        self._token_entry.configure(show="" if self._token_showing else "*")
        self._token_eye.configure(text="隐藏" if self._token_showing else "显示")

    def _lookup_order(self):
        order_no = self.order_no_var.get().strip()
        if not order_no:
            messagebox.showinfo("提示", "请先输入关联订单号")
            return
        try:
            data = self._call_api("GET", f"/api/admin/orders")
            orders = data.get("orders", [])
            for o in orders:
                if o["order_no"].startswith(order_no):
                    self.phone_var.set(o.get("phone", ""))
                    if o.get("plan_name"):
                        plan_name = o["plan_name"]
                        for p in self._all_plans:
                            if p["id"] == o.get("plan_type_id") and p.get("duration_days"):
                                from datetime import datetime, timedelta
                                expires = datetime.now() + timedelta(days=p["duration_days"])
                                self.expiry_var.set(expires.strftime("%Y-%m-%d %H:%M:%S"))
                                break
                    self.status_var.set(f"已从订单 {order_no} 回填信息")
                    return
            messagebox.showinfo("提示", "未找到匹配订单")
        except Exception as e:
            self.status_var.set(f"查询失败: {e}")

    def _generate(self):
        body = {"count": 1}
        expiry = self.expiry_var.get().strip()
        notes = self.note_var.get().strip()
        phone = self.phone_var.get().strip()
        if expiry:
            body["expires_at"] = expiry
        try:
            result = self._call_api("POST", "/api/admin/generate-key", body)
        except Exception as e:
            self.status_var.set(f"生成失败: {e}")
            messagebox.showerror("错误", str(e))
            return

        if result.get("ok") and result.get("keys"):
            kd = result["keys"][0]
            sn = kd["serial_number"]
            ecount = 0
            if notes:
                try:
                    self._call_api("POST", "/api/admin/set-notes",
                                   {"serial_number": sn, "notes": notes})
                except Exception:
                    ecount += 1
            if phone:
                try:
                    self._call_api("POST", "/api/admin/set-phone",
                                   {"serial_number": sn, "phone": phone})
                except Exception:
                    ecount += 1
            self.output.configure(state="normal")
            self.output.delete("1.0", "end")
            self.output.insert("1.0", kd["license_key"])
            self.output.configure(state="disabled")
            extra = f"  到期: {expiry}" if expiry else ""
            self.status_var.set(f"生成成功 — #{sn:05d}{extra}")
            self._list_keys()
        else:
            self.status_var.set("服务器返回异常")

    def _list_keys(self):
        try:
            result = self._call_api("GET", "/api/admin/keys")
        except Exception as e:
            self.status_var.set(f"获取列表失败: {e}")
            return

        self._all_keys = result.get("keys", [])
        self._all_keys.sort(key=lambda k: (1 if k.get("is_revoked") else 0, k.get("serial_number", 0)))
        self._apply_filter()

    def _apply_filter(self):
        query = self.search_var.get().strip()
        keys = self._all_keys
        if query:
            keys = [k for k in keys if query in (k.get("phone") or "")]
        self._render_tree(keys)
        self.status_var.set(f"共 {len(keys)} 个注册码" + (f"（搜索: {query}）" if query else ""))

    def _clear_search(self):
        self.search_var.set("")
        self._apply_filter()

    def _render_tree(self, keys):
        for item in self.tree.get_children():
            self.tree.delete(item)

        for k in keys:
            sn = f"#{k['serial_number']:05d}"
            if k.get("is_revoked"):
                status = "已吊销"
            elif k.get("is_suspended"):
                status = "已暂停"
            elif k.get("activated"):
                status = "已激活"
            else:
                status = "未使用"

            expires = k.get("expires_at") or "永久"
            notes = k.get("notes", "") or ""
            phone = k.get("phone", "") or ""
            created = (k.get("created_at") or "")[:19]
            key_str = k.get("license_key", "")
            self.tree.insert("", "end", values=(sn, key_str, status, phone, notes, expires, created),
                             iid=str(k["serial_number"]))

    def _get_selected(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showinfo("提示", "请先在列表中选中一个注册码")
            return None, None
        sn = int(sel[0])
        values = self.tree.item(sel[0], "values")
        return sn, values

    def _copy_selected_key(self):
        sn, values = self._get_selected()
        if sn is None:
            return
        key = values[1] if values and len(values) > 1 else ""
        if key:
            self.root.clipboard_clear()
            self.root.clipboard_append(key)
            self.status_var.set(f"#{sn:05d} 注册码已复制到剪贴板")

    def _edit_phone(self):
        sn, values = self._get_selected()
        if sn is None:
            return
        current = values[3] if values and len(values) > 3 else ""
        dialog = tk.Toplevel(self.root)
        dialog.title(f"编辑手机 — #{sn:05d}")
        dialog.resizable(False, False)
        dialog.geometry("320x140")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text=f"当前手机: {current or '(无)'}",
                  font=("Microsoft YaHei UI", 9)).pack(pady=(12, 8))
        ttk.Label(dialog, text="新手机号:", font=("Microsoft YaHei UI", 9)).pack()
        entry_var = tk.StringVar(value=current)
        entry = ttk.Entry(dialog, textvariable=entry_var, font=("Microsoft YaHei UI", 9), width=24)
        entry.pack(pady=(4, 0))
        entry.select_range(0, "end")
        entry.focus_set()

        def do_set():
            val = entry_var.get().strip()
            try:
                self._call_api("POST", "/api/admin/set-phone",
                               {"serial_number": sn, "phone": val})
                self.status_var.set(f"#{sn:05d} 手机已更新")
                self._list_keys()
                dialog.destroy()
            except Exception as e:
                messagebox.showerror("错误", str(e), parent=dialog)

        ttk.Button(dialog, text="确认", command=do_set).pack(pady=(12, 0))

    def _view_notes(self):
        sn, values = self._get_selected()
        if sn is None:
            return
        notes = values[4] if values and len(values) > 4 else ""
        key = values[1] if values and len(values) > 1 else ""
        dialog = tk.Toplevel(self.root)
        dialog.title(f"查看备注 — #{sn:05d}")
        dialog.resizable(False, False)
        dialog.geometry("520x240")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text=f"注册码: {key}",
                  font=("Consolas", 8), foreground="gray").pack(pady=(12, 4), padx=16, anchor="w")
        ttk.Label(dialog, text="备注内容:", font=("Microsoft YaHei UI", 9, "bold")).pack(anchor="w", padx=16, pady=(4, 2))
        text = tk.Text(dialog, height=5, font=("Microsoft YaHei UI", 10),
                       relief="flat", borderwidth=1, highlightthickness=1,
                       highlightbackground="#ccc", padx=8, pady=6)
        text.pack(fill="both", expand=True, padx=16, pady=(0, 4))
        text.insert("1.0", notes if notes else "（无备注）")
        if not notes:
            text.configure(fg="gray")
        text.configure(state="disabled")
        ttk.Button(dialog, text="关闭", command=dialog.destroy).pack(pady=(0, 12))

    def _edit_notes(self):
        sn, values = self._get_selected()
        if sn is None:
            return

        current = values[4] if values and len(values) > 4 else ""
        dialog = tk.Toplevel(self.root)
        dialog.title(f"编辑备注 — #{sn:05d}")
        dialog.resizable(False, False)
        dialog.geometry("400x160")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text=f"当前备注: {current}",
                  font=("Microsoft YaHei UI", 9)).pack(pady=(12, 8))
        ttk.Label(dialog, text="新备注:", font=("Microsoft YaHei UI", 9)).pack()
        entry_var = tk.StringVar(value=current)
        entry = ttk.Entry(dialog, textvariable=entry_var, font=("Microsoft YaHei UI", 9), width=40)
        entry.pack(pady=(4, 0))
        entry.select_range(0, "end")
        entry.focus_set()

        def do_set():
            val = entry_var.get().strip()
            try:
                self._call_api("POST", "/api/admin/set-notes",
                               {"serial_number": sn, "notes": val})
                self.status_var.set(f"#{sn:05d} 备注已更新")
                self._list_keys()
                dialog.destroy()
            except Exception as e:
                messagebox.showerror("错误", str(e), parent=dialog)

        ttk.Button(dialog, text="确认", command=do_set).pack(pady=(12, 0))

    def _toggle_suspend(self):
        sn, values = self._get_selected()
        if sn is None:
            return
        is_suspended = values and len(values) > 1 and values[2] == "已暂停"
        action = "恢复" if is_suspended else "暂停"
        label = f"确定要{action} #{sn:05d} 吗？"
        if is_suspended:
            label += "\n\n恢复后该注册码可继续使用。"
        else:
            label += "\n\n暂停后已激活的设备将被解除绑定，该注册码暂时无法使用（可恢复）。"
        if not messagebox.askyesno(f"确认{action}", label):
            return
        try:
            self._call_api("POST", "/api/admin/suspend",
                           {"serial_number": sn, "suspend": not is_suspended})
            self.status_var.set(f"#{sn:05d} 已{action}")
            self._list_keys()
        except Exception as e:
            self.status_var.set(f"{action}失败: {e}")
            messagebox.showerror("错误", str(e))

    def _set_expiry(self):
        sn, values = self._get_selected()
        if sn is None:
            return
        current = values[5] if values and len(values) > 5 else ""
        dialog = tk.Toplevel(self.root)
        dialog.title(f"修改到期时间 — #{sn:05d}")
        dialog.resizable(False, False)
        dialog.geometry("360x140")
        dialog.transient(self.root)
        dialog.grab_set()
        ttk.Label(dialog, text=f"当前到期时间: {current}",
                  font=("Microsoft YaHei UI", 9)).pack(pady=(12, 8))
        ttk.Label(dialog, text="新到期时间（留空=永久）:", font=("Microsoft YaHei UI", 9)).pack()
        entry_var = tk.StringVar()
        entry = ttk.Entry(dialog, textvariable=entry_var, font=("Consolas", 9), width=30)
        entry.pack(pady=(4, 0))
        ttk.Label(dialog, text="格式: 2026-12-31 23:59:59", foreground="gray",
                  font=("Microsoft YaHei UI", 8)).pack()

        def do_set():
            val = entry_var.get().strip() or None
            try:
                self._call_api("POST", "/api/admin/set-expiry",
                               {"serial_number": sn, "expires_at": val})
                self.status_var.set(f"#{sn:05d} 到期时间已更新")
                self._list_keys()
                dialog.destroy()
            except Exception as e:
                messagebox.showerror("错误", str(e), parent=dialog)
        ttk.Button(dialog, text="确认", command=do_set).pack(pady=(12, 0))

    def _revoke(self):
        sn, values = self._get_selected()
        if sn is None:
            return
        if values and len(values) > 1 and values[2] == "已吊销":
            messagebox.showinfo("提示", "该注册码已被吊销")
            return
        if not messagebox.askyesno("确认吊销",
                                   f"确定要吊销 #{sn:05d} 吗？\n\n"
                                   "吊销后该注册码永久作废（记录保留），"
                                   "已激活设备将被解除绑定。"):
            return
        try:
            self._call_api("POST", "/api/admin/revoke", {"serial_number": sn})
            self.status_var.set(f"#{sn:05d} 已吊销")
            self._list_keys()
        except Exception as e:
            self.status_var.set(f"吊销失败: {e}")
            messagebox.showerror("错误", str(e))

    def _copy(self):
        content = self.output.get("1.0", "end-1c")
        if content.strip() and "点击" not in content:
            self.root.clipboard_clear()
            self.root.clipboard_append(content)
            self.status_var.set(f"{self.status_var.get()} — 已复制")

    # ── Site Config ─────────────────────────────────────────────

    def _load_site_config(self, silent=False):
        try:
            data = self._call_api("GET", "/api/admin/site-config")
            self.announce_text.delete("1.0", "end")
            self.announce_text.insert("1.0", data.get("announce_html", ""))
            self.announce_enabled_var.set(data.get("announce_enabled", "0") == "1")
            self.purchase_enabled_var.set(data.get("purchase_enabled", "0") == "1")
            self.download_desktop_var.set(data.get("download_desktop_url", ""))
            self.download_server_var.set(data.get("download_server_url", ""))
            self.status_var.set("站点配置已加载")
            self.announce_status.set("")
            self.announce_enabled_status.set("")
        except Exception as e:
            if not silent:
                messagebox.showerror("加载失败", str(e))
            self.status_var.set(f"加载失败: {e}")

    def _save_announce(self):
        try:
            html = self.announce_text.get("1.0", "end-1c")
            enabled = "1" if self.announce_enabled_var.get() else "0"
            self._call_api("PUT", "/api/admin/site-config", {
                "announce_html": html,
                "announce_enabled": enabled,
            })
            self.announce_status.set("已保存")
            self.status_var.set("公告已保存")
            self.root.after(3000, lambda: self.announce_status.set(""))
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            self.status_var.set(f"保存失败: {e}")

    def _save_purchase(self):
        try:
            enabled = "1" if self.purchase_enabled_var.get() else "0"
            self._call_api("PUT", "/api/admin/site-config", {
                "purchase_enabled": enabled,
            })
            self.purchase_status.set("已保存")
            self.status_var.set("购买开关已保存")
            self.root.after(3000, lambda: self.purchase_status.set(""))
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            self.status_var.set(f"保存失败: {e}")

    def _save_download_urls(self):
        try:
            self._call_api("PUT", "/api/admin/site-config", {
                "download_desktop_url": self.download_desktop_var.get().strip(),
                "download_server_url": self.download_server_var.get().strip(),
            })
            self.download_status.set("已保存")
            self.status_var.set("下载链接已保存")
            self.root.after(3000, lambda: self.download_status.set(""))
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            self.status_var.set(f"保存失败: {e}")

    # ── Brand Info ────────────────────────────────────────────────

    def _load_brand_info(self):
        try:
            data = self._call_api("GET", "/api/admin/site-config")
            self.brand_name_var.set(data.get("brand_name", ""))
            self.brand_logo_var.set(data.get("brand_logo", ""))
            self.branding_slogan_var.set(data.get("branding_slogan", ""))
            self.app_version_var.set(data.get("app_version", ""))
            self.branding_copyright_var.set(data.get("branding_copyright", ""))
            self.branding_signature_var.set(data.get("branding_signature", ""))
            self.about_text.delete("1.0", "end")
            self.about_text.insert("1.0", data.get("about_content", ""))
            self.status_var.set("品牌信息已加载")
            self.brand_status_var.set("")
        except Exception as e:
            messagebox.showerror("加载失败", str(e))
            self.status_var.set(f"加载失败: {e}")

    def _save_brand_info(self):
        try:
            self._call_api("PUT", "/api/admin/site-config", {
                "brand_name": self.brand_name_var.get().strip(),
                "brand_logo": self.brand_logo_var.get().strip(),
                "branding_slogan": self.branding_slogan_var.get().strip(),
                "app_version": self.app_version_var.get().strip(),
                "branding_copyright": self.branding_copyright_var.get().strip(),
                "branding_signature": self.branding_signature_var.get().strip(),
                "about_content": self.about_text.get("1.0", "end-1c"),
            })
            self.brand_status_var.set("已保存")
            self.status_var.set("品牌信息已保存")
            self.root.after(3000, lambda: self.brand_status_var.set(""))
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            self.status_var.set(f"保存失败: {e}")

    def _upload_logo(self):
        filepath = filedialog.askopenfilename(
            title="选择 LOGO 图片",
            filetypes=[("图片文件", "*.png;*.jpg;*.jpeg"), ("所有文件", "*.*")]
        )
        if not filepath:
            return
        try:
            result = self._upload_file("/api/admin/upload-logo", filepath, "logo")
            url = result.get("url", "")
            self.brand_logo_var.set(url)
            self._update_logo_preview()
            self.brand_status_var.set("LOGO 已上传")
            self.status_var.set("LOGO 已上传到服务器")
            self.root.after(3000, lambda: self.brand_status_var.set(""))
        except Exception as e:
            messagebox.showerror("上传失败", str(e))
            self.status_var.set(f"LOGO 上传失败: {e}")

    def _update_logo_preview(self):
        url = self.brand_logo_var.get().strip()
        if not url:
            self.logo_preview_label.configure(image="", text="")
            self._logo_photo = None
            return
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
            img = Image.open(BytesIO(data))
            img.thumbnail((80, 28), Image.LANCZOS)
            self._logo_photo = ImageTk.PhotoImage(img)
            self.logo_preview_label.configure(image=self._logo_photo, text="")
        except Exception:
            self.logo_preview_label.configure(image="", text="(无法加载预览)")

    # ── Plan Management ──────────────────────────────────────────

    def _list_plans(self):
        try:
            data = self._call_api("GET", "/api/admin/plans")
            self._all_plans = data.get("plans", [])
        except Exception as e:
            self.status_var.set(f"获取套餐列表失败: {e}")
            return

        for item in self.plan_tree.get_children():
            self.plan_tree.delete(item)

        for p in self._all_plans:
            dur = "永久" if p["duration_days"] is None else f"{p['duration_days']}天"
            status = "启用" if p["is_active"] else "禁用"
            self.plan_tree.insert("", "end",
                                  values=(p["id"], p["name"], p["price_yuan"], dur, status, p["sort_order"]),
                                  iid=str(p["id"]))
        self.plan_status_var.set(f"共 {len(self._all_plans)} 个套餐")

    def _get_selected_plan(self):
        sel = self.plan_tree.selection()
        if not sel:
            messagebox.showinfo("提示", "请先选中一个套餐")
            return None
        pid = int(sel[0])
        for p in self._all_plans:
            if p["id"] == pid:
                return p
        return None

    def _add_plan(self):
        self._plan_dialog(None)

    def _edit_plan(self):
        plan = self._get_selected_plan()
        if plan is None:
            return
        self._plan_dialog(plan)

    def _plan_dialog(self, plan):
        is_edit = plan is not None
        dialog = tk.Toplevel(self.root)
        dialog.title("编辑套餐" if is_edit else "新增套餐")
        dialog.resizable(False, False)
        dialog.geometry("420x340")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text="套餐名称:", font=("Microsoft YaHei UI", 9)).pack(anchor="w", padx=16, pady=(12, 2))
        name_var = tk.StringVar(value=plan["name"] if is_edit else "")
        ttk.Entry(dialog, textvariable=name_var, font=("Microsoft YaHei UI", 9), width=40).pack(padx=16)

        ttk.Label(dialog, text="价格 (元):", font=("Microsoft YaHei UI", 9)).pack(anchor="w", padx=16, pady=(8, 2))
        price_var = tk.StringVar(value=str(plan["price_yuan"]) if is_edit else "")
        ttk.Entry(dialog, textvariable=price_var, font=("Microsoft YaHei UI", 9), width=20).pack(padx=16, anchor="w")

        ttk.Label(dialog, text="有效期:", font=("Microsoft YaHei UI", 9)).pack(anchor="w", padx=16, pady=(8, 2))
        dur_frame = ttk.Frame(dialog); dur_frame.pack(fill="x", padx=16)
        dur_presets = {"永久": None, "1个月": 30, "3个月": 90, "6个月": 180, "1年": 365}
        dur_var = tk.StringVar(value="永久")
        if is_edit:
            if plan["duration_days"] is None:
                dur_var.set("永久")
            elif plan["duration_days"] in dur_presets.values():
                for k, v in dur_presets.items():
                    if v == plan["duration_days"]:
                        dur_var.set(k)
                        break
            else:
                dur_var.set("自定义")
        dur_combo = ttk.Combobox(dur_frame, textvariable=dur_var, values=list(dur_presets.keys()) + ["自定义"],
                                 state="readonly", width=10)
        dur_combo.pack(side="left", padx=(0, 8))
        custom_var = tk.StringVar(value=str(plan["duration_days"]) if is_edit and plan["duration_days"] else "")
        custom_entry = ttk.Entry(dur_frame, textvariable=custom_var, font=("Microsoft YaHei UI", 9), width=8)
        custom_entry.pack(side="left")
        ttk.Label(dur_frame, text="天", font=("Microsoft YaHei UI", 9)).pack(side="left")

        def on_dur_change(*args):
            if dur_var.get() == "自定义":
                custom_entry.configure(state="normal")
            else:
                custom_entry.configure(state="disabled")
        dur_var.trace_add("write", on_dur_change)
        if dur_var.get() != "自定义":
            custom_entry.configure(state="disabled")

        ttk.Label(dialog, text="功能说明 (每行一个):", font=("Microsoft YaHei UI", 9)).pack(anchor="w", padx=16, pady=(8, 2))
        features_text = tk.Text(dialog, height=4, font=("Microsoft YaHei UI", 9),
                                relief="flat", borderwidth=1, highlightthickness=1,
                                highlightbackground="#ccc", padx=6, pady=4)
        features_text.pack(fill="x", padx=16)
        if is_edit and plan.get("features"):
            features_text.insert("1.0", "\n".join(plan["features"]))

        def do_save():
            name = name_var.get().strip()
            try:
                price = float(price_var.get().strip())
            except ValueError:
                messagebox.showerror("错误", "价格必须是数字", parent=dialog)
                return
            if not name or price <= 0:
                messagebox.showerror("错误", "套餐名称和价格不能为空", parent=dialog)
                return

            dur_label = dur_var.get()
            if dur_label == "永久":
                duration = None
            elif dur_label == "自定义":
                try:
                    duration = int(custom_var.get().strip())
                except ValueError:
                    messagebox.showerror("错误", "自定义天数必须是整数", parent=dialog)
                    return
            else:
                duration = dur_presets[dur_label]

            features = [l.strip() for l in features_text.get("1.0", "end-1c").split("\n") if l.strip()]

            body = {"name": name, "price_yuan": price, "duration_days": duration, "features": features}
            try:
                if is_edit:
                    self._call_api("PUT", f"/api/admin/plans/{plan['id']}", body)
                else:
                    body["sort_order"] = len(self._all_plans)
                    self._call_api("POST", "/api/admin/plans", body)
                self._list_plans()
                dialog.destroy()
            except Exception as e:
                messagebox.showerror("错误", str(e), parent=dialog)

        ttk.Button(dialog, text="保存", command=do_save).pack(pady=(12, 0))

    def _toggle_plan_active(self):
        plan = self._get_selected_plan()
        if plan is None:
            return
        try:
            self._call_api("PUT", f"/api/admin/plans/{plan['id']}",
                           {"is_active": 0 if plan["is_active"] else 1})
            self._list_plans()
        except Exception as e:
            self.status_var.set(f"操作失败: {e}")

    def _delete_plan(self):
        plan = self._get_selected_plan()
        if plan is None:
            return
        if not messagebox.askyesno("确认删除", f"确定要删除套餐「{plan['name']}」吗？"):
            return
        try:
            self._call_api("DELETE", f"/api/admin/plans/{plan['id']}")
            self._list_plans()
        except Exception as e:
            self.status_var.set(f"删除失败: {e}")

    def _move_plan(self, delta):
        plan = self._get_selected_plan()
        if plan is None:
            return
        new_order = (plan["sort_order"] or 0) + delta
        try:
            self._call_api("PUT", f"/api/admin/plans/{plan['id']}", {"sort_order": max(0, new_order)})
            self._list_plans()
        except Exception as e:
            self.status_var.set(f"排序失败: {e}")

    # ── QR Code Management ───────────────────────────────────────

    def _load_qrcodes(self):
        try:
            data = self._call_api("GET", "/api/admin/payment-config")
        except Exception as e:
            self.status_var.set(f"加载收款码失败: {e}")
            return

        server = self.server_url.get().strip().rstrip("/")
        for key, label in [("wechat_qr", "wx"), ("alipay_qr", "ali")]:
            filename = data.get(key, "")
            if filename:
                url = f"{server}/api/qrcode/{filename}"
                try:
                    req = urllib.request.Request(url)
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        img_data = resp.read()
                    from PIL import Image as PILImage
                    from PIL import ImageTk
                    import io
                    pil_img = PILImage.open(io.BytesIO(img_data))
                    w, h = pil_img.size
                    scale = max(1, max(w, h) // 200)
                    pil_img = pil_img.resize((w // scale, h // scale), PILImage.LANCZOS)
                    photo = ImageTk.PhotoImage(pil_img)
                    if label == "wx":
                        self._qr_photos["wechat"] = photo
                        self.wx_preview_label.configure(image=photo, text="")
                    else:
                        self._qr_photos["alipay"] = photo
                        self.ali_preview_label.configure(image=photo, text="")
                except Exception:
                    getattr(self, f"{label}_preview_label").configure(text="(加载失败)")
            else:
                getattr(self, f"{label}_preview_label").configure(text="(未上传)")
        self.status_var.set("收款码已加载")

    def _upload_qr(self, key):
        filepath = filedialog.askopenfilename(
            title="选择收款码图片",
            filetypes=[("图片文件", "*.png;*.jpg;*.jpeg"), ("所有文件", "*.*")]
        )
        if not filepath:
            return

        label_map = {"wechat_qr": "微信", "alipay_qr": "支付宝"}
        status_var = self.wx_status_var if key == "wechat_qr" else self.ali_status_var
        try:
            self._upload_file("/api/admin/payment-config", filepath, key)
        except Exception as e:
            self.status_var.set(f"上传失败: {e}")
            messagebox.showerror("上传失败", str(e))
            return
        status_var.set("已上传")
        self.root.after(3000, lambda: status_var.set(""))
        self.status_var.set(f"{label_map[key]}收款码已上传")
        try:
            self._load_qrcodes()
        except Exception:
            pass

    # ── Order Management ─────────────────────────────────────────

    def _list_orders(self):
        status = self.order_filter_var.get()
        path = f"/api/admin/orders?status={status}" if status else "/api/admin/orders"
        try:
            data = self._call_api("GET", path)
            self._all_orders = data.get("orders", [])
        except Exception as e:
            self.status_var.set(f"获取订单列表失败: {e}")
            return

        for item in self.order_tree.get_children():
            self.order_tree.delete(item)

        for o in self._all_orders:
            order_no_short = o["order_no"][:8]
            key_sn = f"#{o['license_key_sn']:05d}" if o.get("license_key_sn") else ""
            self.order_tree.insert("", "end",
                                   values=(o["id"], order_no_short, o["phone"], o["plan_name"],
                                           o["amount_yuan"], STATUS_LABELS.get(o["status"], o["status"]),
                                           o["payment_ref"], key_sn,
                                           (o.get("created_at") or "")[:19]),
                                   iid=str(o["id"]))
        self.order_count_var.set(f"共 {len(self._all_orders)} 个订单")

    def _get_selected_order(self):
        sel = self.order_tree.selection()
        if not sel:
            messagebox.showinfo("提示", "请先选中一个订单")
            return None
        oid = int(sel[0])
        for o in self._all_orders:
            if o["id"] == oid:
                return o
        return None

    def _verify_order(self):
        order = self._get_selected_order()
        if order is None:
            return
        if order["status"] not in ("submitted", "payment_pending"):
            messagebox.showinfo("提示", "只能审核待付款或已付款待审核的订单")
            return
        if not messagebox.askyesno("确认收款",
                                   f"确认收到「{order['phone']}」的 {order['amount_yuan']} 元付款？\n\n"
                                   f"套餐: {order['plan_name']}\n"
                                   f"确认后将自动生成激活码。"):
            return
        try:
            result = self._call_api("PUT", f"/api/admin/orders/{order['id']}/verify")
            self._list_orders()
            lic = result.get("license_key", "")
            sn = result.get("serial_number", "")
            msg = f"收款已确认，激活码已生成\n\n序列号: #{sn:05d}\n激活码: {lic}"
            messagebox.showinfo("操作成功", msg)
            self.order_status_var.set(f"订单 #{order['id']} 已确认收款 — SN: {sn:05d}")
        except Exception as e:
            self.status_var.set(f"确认收款失败: {e}")
            messagebox.showerror("错误", str(e))

    def _reject_order(self):
        order = self._get_selected_order()
        if order is None:
            return
        if order["status"] in ("completed", "cancelled"):
            messagebox.showinfo("提示", "该订单已完成或已驳回")
            return

        dialog = tk.Toplevel(self.root)
        dialog.title("驳回订单")
        dialog.resizable(False, False)
        dialog.geometry("360x180")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text=f"驳回订单 #{order['id']} — {order.get('phone', '')}",
                  font=("Microsoft YaHei UI", 9, "bold")).pack(pady=(12, 8))
        ttk.Label(dialog, text="驳回原因:", font=("Microsoft YaHei UI", 9)).pack(anchor="w", padx=16)
        reason_var = tk.StringVar(value="未收到款项")
        ttk.Entry(dialog, textvariable=reason_var, font=("Microsoft YaHei UI", 9), width=36).pack(padx=16, pady=(2, 0))

        def do_reject():
            try:
                self._call_api("PUT", f"/api/admin/orders/{order['id']}/reject",
                               {"notes": reason_var.get().strip()})
                self._list_orders()
                dialog.destroy()
                self.order_status_var.set(f"订单 #{order['id']} 已驳回")
            except Exception as e:
                messagebox.showerror("错误", str(e), parent=dialog)

        ttk.Button(dialog, text="确认驳回", command=do_reject).pack(pady=(12, 0))

    def _view_order_detail(self):
        order = self._get_selected_order()
        if order is None:
            return

        dialog = tk.Toplevel(self.root)
        dialog.title(f"订单详情 — #{order['id']}")
        dialog.resizable(False, False)
        dialog.geometry("520x380")
        dialog.transient(self.root)
        dialog.grab_set()

        info = (
            f"订单号: {order['order_no']}\n"
            f"手机号: {order['phone']}\n"
            f"套餐: {order['plan_name']}\n"
            f"金额: ¥{order['amount_yuan']}\n"
            f"状态: {STATUS_LABELS.get(order['status'], order['status'])}\n"
            f"付款参考号: {order['payment_ref'] or '(未填写)'}\n"
            f"密钥序列号: #{order['license_key_sn']:05d}" if order.get('license_key_sn') else "密钥序列号: (未生成)"
        )
        if order.get("license_key_sn"):
            info += f"\n密钥序列号: #{order['license_key_sn']:05d}"
        else:
            info += "\n密钥序列号: (未生成)"

        info += (
            f"\n创建时间: {order.get('created_at', '')}\n"
            f"更新时间: {order.get('updated_at', '')}"
        )

        ttk.Label(dialog, text=info, font=("Consolas", 9),
                  justify="left").pack(padx=16, pady=(12, 4), anchor="w")

        ttk.Label(dialog, text="备注:", font=("Microsoft YaHei UI", 9, "bold")).pack(anchor="w", padx=16, pady=(8, 2))
        notes_text = tk.Text(dialog, height=4, font=("Microsoft YaHei UI", 9),
                             relief="flat", borderwidth=1, highlightthickness=1,
                             highlightbackground="#ccc", padx=6, pady=4)
        notes_text.pack(fill="x", padx=16)
        notes_text.insert("1.0", order.get("notes", "") or "")
        notes_text.configure(state="disabled")
        ttk.Button(dialog, text="关闭", command=dialog.destroy).pack(pady=(8, 12))

    def _edit_order_notes(self):
        order = self._get_selected_order()
        if order is None:
            return

        dialog = tk.Toplevel(self.root)
        dialog.title(f"编辑备注 — 订单 #{order['id']}")
        dialog.resizable(False, False)
        dialog.geometry("400x160")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text=f"当前备注: {order.get('notes') or '(无)'}",
                  font=("Microsoft YaHei UI", 9)).pack(pady=(12, 8))
        entry_var = tk.StringVar(value=order.get("notes", ""))
        ttk.Entry(dialog, textvariable=entry_var, font=("Microsoft YaHei UI", 9), width=42).pack(pady=(4, 0))

        def do_save():
            try:
                self._call_api("PUT", f"/api/admin/orders/{order['id']}/notes",
                               {"notes": entry_var.get().strip()})
                self._list_orders()
                dialog.destroy()
            except Exception as e:
                messagebox.showerror("错误", str(e), parent=dialog)

        ttk.Button(dialog, text="保存", command=do_save).pack(pady=(12, 0))

    def _schedule_order_refresh(self):
        try:
            self._list_orders()
        except Exception:
            pass
        self._orders_auto_refresh = self.root.after(30000, self._schedule_order_refresh)


def main():
    root = tk.Tk()
    app = KeyGenApp(root)
    root.after(200, lambda: app._list_keys())
    root.after(400, lambda: app._list_plans())
    root.mainloop()


if __name__ == "__main__":
    main()
