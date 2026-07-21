"""License key manager GUI for Yishao Agent.
Connects to activation server: generate, suspend, resume, set expiry, set notes, revoke,
plus site config (pricing & announcement).
"""
import json
import tkinter as tk
from tkinter import ttk, messagebox
import urllib.request
import urllib.error


class KeyGenApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Yishao Agent — 注册码管理器")
        self.root.resizable(True, True)
        w, h = 1100, 740
        ws = root.winfo_screenwidth()
        hs = root.winfo_screenheight()
        x = (ws - w) // 2
        y = (hs - h) // 2
        root.geometry(f"{w}x{h}+{x}+{y}")
        root.minsize(900, 560)
        self._all_keys = []  # cached for search/filter
        self._build_ui()

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

    def _build_ui(self):
        # Title
        ttk.Label(self.root, text="Yishao Agent 注册码管理器",
                  font=("Microsoft YaHei UI", 14, "bold")).pack(pady=(16, 2))
        ttk.Label(self.root, text="生成 / 查看 / 暂停 / 授权时间 / 备注 / 吊销  |  站点配置（标价 & 公告）",
                  font=("Microsoft YaHei UI", 9)).pack(pady=(0, 12))

        # ── Server config ──
        cfg = ttk.LabelFrame(self.root, text="服务器连接", padding=8)
        cfg.pack(fill="x", padx=12, pady=(0, 8))

        row1 = ttk.Frame(cfg); row1.pack(fill="x", pady=(0, 4))
        ttk.Label(row1, text="地址：", width=8).pack(side="left")
        self.server_url = tk.StringVar(value="http://120.25.251.172:18777")
        ttk.Entry(row1, textvariable=self.server_url, font=("Consolas", 9)).pack(side="right", expand=True, fill="x")

        row2 = ttk.Frame(cfg); row2.pack(fill="x")
        ttk.Label(row2, text="令牌：", width=8).pack(side="left")
        self.admin_token = tk.StringVar()
        self._token_showing = False
        self._token_entry = ttk.Entry(row2, textvariable=self.admin_token, font=("Consolas", 9), show="*")
        self._token_entry.pack(side="right", expand=True, fill="x", padx=(0, 4))
        self._token_eye = ttk.Button(row2, text="显示", width=5, command=self._toggle_token_vis)
        self._token_eye.pack(side="right")

        # ── Notebook tabs ──
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=12, pady=(0, 8))

        self._build_key_tab()
        self._build_site_config_tab()

        # Status bar
        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(self.root, textvariable=self.status_var, font=("Microsoft YaHei UI", 8),
                  foreground="gray").pack(side="bottom", anchor="w", padx=12, pady=(0, 8))

    # ── Tab 1: Key Management ────────────────────────────────────────

    def _build_key_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="注册码管理")

        # ── Generate section ──
        gen_frame = ttk.LabelFrame(tab, text="生成新注册码", padding=8)
        gen_frame.pack(fill="x", pady=(8, 8))

        gen_row1 = ttk.Frame(gen_frame); gen_row1.pack(fill="x")
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

        self.gen_btn = ttk.Button(gen_frame, text="生成注册码", command=self._generate)
        self.gen_btn.pack(anchor="w", pady=(6, 0))

        # Generated key output
        self.output = tk.Text(tab, height=2, font=("Consolas", 10),
                              bg="#1e1e1e", fg="#4ec94e", relief="flat", borderwidth=1,
                              highlightthickness=1, highlightbackground="#555", padx=10, pady=8)
        self.output.pack(fill="x", pady=(0, 4))
        self.output.insert("1.0", "点击[生成注册码]...")
        self.output.configure(state="disabled")

        cp_frame = ttk.Frame(tab); cp_frame.pack(fill="x", pady=(0, 8))
        self.copy_btn = ttk.Button(cp_frame, text="复制注册码", command=self._copy)
        self.copy_btn.pack(side="left")

        # ── Search bar ──
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

        # ── Key list ──
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

        # ── Action buttons ──
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

    # ── Tab 2: Site Config ───────────────────────────────────────────

    def _build_site_config_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="站点配置")

        # ── Pricing ──
        pricing_frame = ttk.LabelFrame(tab, text="标价说明（显示在软件登录页底部）", padding=8)
        pricing_frame.pack(fill="x", padx=0, pady=(8, 8))

        info1 = ttk.Frame(pricing_frame); info1.pack(fill="x", pady=(0, 4))
        ttk.Label(info1, text="支持 HTML 格式。留空则不显示在登录页。",
                  foreground="gray", font=("Microsoft YaHei UI", 8)).pack(anchor="w")

        self.pricing_text = tk.Text(pricing_frame, height=4, font=("Consolas", 10),
                                    relief="flat", borderwidth=1, highlightthickness=1,
                                    highlightbackground="#ccc", padx=8, pady=6)
        self.pricing_text.pack(fill="x")

        btn_row1 = ttk.Frame(pricing_frame); btn_row1.pack(fill="x", pady=(6, 0))
        ttk.Button(btn_row1, text="加载当前设置", command=self._load_site_config).pack(side="left", padx=(0, 8))
        ttk.Button(btn_row1, text="保存标价", command=self._save_pricing).pack(side="left")
        self.pricing_status = tk.StringVar()
        ttk.Label(btn_row1, textvariable=self.pricing_status, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

        # ── Announcement ──
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
        ttk.Button(btn_row2, text="保存公告", command=self._save_announce).pack(side="left")
        self.announce_status = tk.StringVar()
        ttk.Label(btn_row2, textvariable=self.announce_status, foreground="green",
                  font=("Microsoft YaHei UI", 9)).pack(side="left", padx=(8, 0))

    def _load_site_config(self):
        try:
            data = self._call_api("GET", "/api/admin/site-config")
            self.pricing_text.delete("1.0", "end")
            self.pricing_text.insert("1.0", data.get("pricing_html", ""))
            self.announce_text.delete("1.0", "end")
            self.announce_text.insert("1.0", data.get("announce_html", ""))
            self.announce_enabled_var.set(data.get("announce_enabled", "0") == "1")
            self.status_var.set("站点配置已加载")
            self.pricing_status.set("")
            self.announce_status.set("")
            self.announce_enabled_status.set("")
        except Exception as e:
            messagebox.showerror("加载失败", str(e))
            self.status_var.set(f"加载失败: {e}")

    def _save_pricing(self):
        try:
            html = self.pricing_text.get("1.0", "end-1c")
            self._call_api("PUT", "/api/admin/site-config", {"pricing_html": html})
            self.pricing_status.set("已保存")
            self.status_var.set("标价说明已保存")
            self.root.after(3000, lambda: self.pricing_status.set(""))
        except Exception as e:
            messagebox.showerror("保存失败", str(e))
            self.status_var.set(f"保存失败: {e}")

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

    # ── Helpers ──────────────────────────────────────────────────────

    def _toggle_token_vis(self):
        self._token_showing = not self._token_showing
        self._token_entry.configure(show="" if self._token_showing else "*")
        self._token_eye.configure(text="隐藏" if self._token_showing else "显示")

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


def main():
    root = tk.Tk()
    app = KeyGenApp(root)
    # Auto-load on start
    root.after(200, lambda: app._list_keys())
    root.mainloop()


if __name__ == "__main__":
    main()
