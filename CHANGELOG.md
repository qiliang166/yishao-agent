# 更新日志

## 2026-08-20

- fix: slide regenerate honors selected model instead of defaulting to first provider model
- chore: update build stamp after white-bg fix (60df5d9)

## 2026-08-20

- fix: stop full-deck hex enforcement from corrupting :root CSS vars
- chore: update build stamp after splice partial-deck fix (00a08d6)

## 2026-08-20

- fix: splice applies fragment-only deck, not full regenerated deck
- chore: update build stamp after apply split-page splice fix (12f2260)

## 2026-08-20

- fix: apply regenerated split A4 pages — splice inserts continuation pages and renumbers
- chore: update build stamp after A4 table row fix (f65e363)

## 2026-08-20

- fix: A4 table pages drop rows — rebuild tbody from body + raise body_limit
- chore: update build stamp after A4 table row-loss fix (ba27953)

## 2026-08-20

- fix: preserve all rows on A4 table split (use browser DOM, not regex)
- chore: update build stamp after A4 real-height pagination fix (4c328e8)

## 2026-08-19

- fix: A4表格分页改用真实渲染高度(Playwright测量)替代行数估算

## 2026-08-19

- fix: A4表格分页误拆分(col3表格padding重复计数+页头页尾被拆散)

## 2026-08-19

- fix: 问题4品牌信息仅本地化3项(LOGO/应用名称/口号)，版本号/版权/签名/软件介绍仍由机器码管理器控制
- chore: update build stamp after batch import/brand/font/A4 fixes (80b27cc)

## 2026-08-19

- feat: batch import account display + batch category edit + local brand settings + A4 table pagination + HTML font editor

## 2026-08-18

- chore: update build stamp after data import/export (9044d28)

## 2026-08-18

- feat: export/import full data package (db + exports + downloads) for one-click deployment
- chore: update build stamp after booklet batch ops (4b02e25)

## 2026-08-17

- feat: batch recommend/delete/download for booklet sections

## 2026-08-17

- fix: define missing logger in llm_service + raise max_tokens to 49152
- chore: update build stamp after image-inline fix (c4cd50c)

## 2026-08-17

- fix: inline local images as base64 for offline downloads
- chore: update build stamp after frozen-mode column seeding fix (95b8530)

## 2026-08-17

- fix: seed column_configs via BASE_DIR in frozen EXE + self-heal missing column items

## 2026-08-16

- fix: block cloning booklets with paid-download chapters
- chore: update build stamp after clone leak fix (5ca4043)

## 2026-08-16

- fix: block cloning booklets with locked paid chapters
- chore: update build stamp after paid-preview leak fix (4bef3eb)

## 2026-08-16

- fix: close two remaining paid-preview leak paths
- chore: update build stamp after paid-preview flag (885afffa)

## 2026-08-16

- feat: add paid-preview flag with batch edit for projects
- chore: update build stamp after reasoning_content fallback (7569a19)

## 2026-08-16

- fix: add reasoning_content fallback to streaming LLM generate
- chore: update build stamp after renewal reject (3b3e4df)

## 2026-08-16

- fix: add reject button for pending renewal in member approval
- chore: update build stamp after standard-doc image insert (cb0d9016)

## 2026-08-16

- feat: allow inserting local images into standard doc editor (base64)
- docs: add backend feature voiceover scripts (14 episodes)
- chore: update build stamp after plaza hero + back-to-top (d2ac4a4)

## 2026-08-14

- feat: add back-to-top floating button on plaza page

## 2026-08-14

- fix: merge slogan and recipe count into one line on plaza hero
- chore: update build stamp after readonly clone fix (f962ebb)

## 2026-08-14

- fix: allow cloning any read-only booklet, not just recommended ones
- chore: update build stamp after dev-experience-officer routing fix (84aa7af)

## 2026-08-14

- fix: route plaza booklet click by admin shell for dev-experience-officer
- chore: update build stamp after booklet list pagination (e1d425c)

## 2026-08-14

- feat: paginate booklet list sections (recommended/mine/users), 24 per page
- chore: update build stamp after plaza card step-5 fix (5e9e9ab)

## 2026-08-14

- fix: plaza card click jumps straight to 预览合成 (step 5)

## 2026-08-14

- feat: plaza page-size selector (50/250/500/all) + total recipe count

## 2026-08-14

- fix: preserve line breaks in speech preview
- chore: update build stamp after button gap fix (7ba223b)

## 2026-08-13

- fix: add gap between 批量新建 and 新建册子 buttons
- chore: update build stamp after zip download (3ddd3c1)

## 2026-08-13

- feat: batch booklet downloads as a single zip
- chore: update build stamp after batch booklet preview/download fix (2907b5f)

## 2026-08-13

- fix: batch booklet cover preview + multi-file download

## 2026-08-13

- feat: batch booklet generation — one booklet per selected project
- chore: update build stamp after booklet filter fix (3a797ad)

## 2026-08-11

- fix: all logged-in users now see only admin-created booklets in browse square
- chore: update build stamp after booklet member filter (6919fc2)

## 2026-08-11

- fix: logged-in members now see only admin-created booklets in browse square
- chore: update build stamp after commit abc06d2

## 2026-08-10

- fix: replace window.confirm with UnlockConfirmDialog in ProjectPage download flow

## 2026-08-10

- fix: ProjectPage stage 5 individual download now checks unlock via canDownload before downloading

## 2026-08-10

- fix: api_can_download and api_unlock_projects now allow stage5.download non-owners to unlock is_downloadable=0 projects

## 2026-08-10

- fix: stage5.download only grants free download for own projects

## 2026-08-10

- fix: auto-assign default role on user creation
- fix: create_project write access now uses member_workspaces + ownership only

## 2026-08-10

- revert: restore WorkspaceSettingsPage to pre-c5de9b8c state

## 2026-08-10

- fix: _collect_all_files fallback uses project name not ID, matching resolve_project_storage

## 2026-08-10

- fix: _collect_export_files use os.listdir instead of os.walk to match _list_project_files filtering

## 2026-08-10

- fix: import file paths broken — rename project dirs from old to new IDs after extraction
- chore: rebuild packages with left-aligned settings page fix

## 2026-08-10

- fix: restore left-aligned layout on workspace settings page

## 2026-08-10

- fix: export dialog with project selection + Save As picker + deleteCategory/listRoles TS fixes

## 2026-08-10

- fix: close export dialog before download + native Save As picker

## 2026-08-10

- fix: export dialog with project selection instead of separate button

## 2026-08-10

- fix: export workspace with selected projects + pass save_root to HTML export collector

## 2026-08-10

- chore: rebuild desktop package with clean factory DB

## 2026-08-10

- fix: enforce unique project_code with UNIQUE index + regenerate on import

## 2026-08-10

- fix: also skip audio files (mp3/wav/ogg/flac/aac/wma) in workspace export

## 2026-08-10

- fix: skip video files (mp4/mkv/webm/avi/mov/flv) in workspace export

## 2026-08-10

- fix: strengthen run_id path traversal validation in _collect_export_files

## 2026-08-09

- fix: include HTML export run dirs in workspace ZIP export/import

## 2026-08-09

- fix: content admins exclude member-created workspaces + create_project workspace access check

## 2026-08-09

- fix: exclude 开发体验员 from member routing in LandingPage, LoginPage, MemberLoginPage

## 2026-08-09

- fix: exclude 开发体验员 from readOnly mode — they have CONTENT_ADMIN_PERMS

## 2026-08-09

- fix: clear storage_path on import — prevents cross-machine path mismatch, regenerates from local save_root

## 2026-08-09

- fix: exclude upgrade payments from pending-renewals list — upgrade record was appearing in both tabs

## 2026-08-09

- fix: exclude source_materials from export — input box content (video URLs, text, file paths) should not be exported; videos on disk still collected via _collect_all_files

## 2026-08-09

- fix: use member_workspaces (user-level) instead of workspace_roles (role-level) for auto-assign

## 2026-08-09

- fix: auto-assign only creator's own roles, not all member roles

## 2026-08-09

- fix: add 下载文件 menu item + route to admin sidebar
- fix: remove import size limits + add project_item_id remap for correct import
- fix: remap project_item_id on import so project_item_results link to correct items
- fix: auto-assign member roles on workspace create + import so non-admin users can see them

## 2026-08-09

- fix: member-created workspaces invisible to creator + default workspace has no role assignment

## 2026-08-09

- chore: remove redundant inline import in desktop_main.py
- fix: desktop port conflict now checks if self is running instead of blindly connecting

## 2026-08-09

- fix: log finish_reason in OpenAI path to detect truncated LLM responses
- exclude KeyGen exe and keygen_config.json from desktop ZIP

## 2026-08-09

- revert brand name as EXE filename — Chinese filename breaks execution

## 2026-08-09

- remove broken NSIS installer step from desktop build

## 2026-08-09

- fix: apply brand_name to spec + replace single-EXE copy with proper desktop ZIP

## 2026-08-09

- feat: prompt studio persistent error log + frontend error display

## 2026-08-09

- chore: rebuild packages with contact_info moved to admin settings (59e7c65)
- fix: move contact_info from KeyGen brand info to local admin settings

## 2026-08-09

- fix: persist purchase order_no + license_key to localStorage across refresh
- chore: rebuild both packages with KeyGen brand info + logo upload (e0bacd5)

## 2026-08-09

- feat: KeyGen brand info tab + logo upload with preview + PUT endpoint fix
- chore: rebuild desktop package with import fix (940a1cf)

## 2026-08-09

- chore: rebuild server packages with import fix (940a1cf)

## 2026-08-09

- fix: only set workspace_id for tables that actually have the column
- chore: rebuild server packages with workspace_id fix (0ab59d8)

## 2026-08-09

- fix: workspace_id excluded by _EXCLUDE_FIELDS causing NOT NULL constraint on import
- chore: rebuild all distribution packages (3708282)

## 2026-08-09

- chore: rebuild server packages with dialog overlay fix (834d982)

## 2026-08-09

- fix: consistent overlay close pattern for ZIP import dialog

## 2026-08-09

- feat: add Enter key support for batch author select dialog
- chore: rebuild all 3 packages with custom dialogs (8c444e5)

## 2026-08-09

- feat: custom dialogs for batch edit points/author & ZIP import, replace window.prompt & native file picker
- chore: rebuild all 3 distribution packages with batch edit feature (330671b)

## 2026-08-08

- feat: batch edit points & author in project list toolbar

## 2026-08-08

- chore: rebuild server-update with SQLite batch fix

## 2026-08-08

- fix: workspace_io security hardening (path traversal, SQL injection, resource limits) + indentation fix in app.py

## 2026-08-08

- feat: workspace full data export/import (ZIP with projects + files)

## 2026-08-08

- fix: add backend/__init__.py so PyInstaller recognizes backend as a package

## 2026-08-08

- fix: LLM recommended models changed to deepseek-v4-flash and deepseek-v4-pro

## 2026-08-08

- fix: JWT secret derived from machine ID, brand info migrated to KeyGen

## 2026-08-08

- fix: ensure download URLs use port 8767, remove stray .bak file

## 2026-08-08

- fix: build_desktop.ps1 cleans dist before staging — prevents dev data leakage

## 2026-08-08

- fix: factory default branding changed to 勺启 食谱 — DEFAULT_SITE_NAME and index.html title
- fix: correct download URLs port 4321→8767, fix NSIS makensis path detection

## 2026-08-08

- fix: remove ref_max_len truncation from focused user messages

## 2026-08-08

- fix: set ref_max_len for C路 to 35K — core_prompt_configs ref is 30K, was truncated at 20K default

## 2026-08-08

- fix: root cause — reference JSON was truncated at 20K, c5 rules never reached LLM. Increase A路 ref_max_len to 50K.

## 2026-08-08

- fix: add _fixup_c5_rules fallback — auto-generate c5 rules if LLM returns empty {}

## 2026-08-08

- fix: strengthen c4/c5 rules constraint in A路 prompt — split into separate lines, add Non-empty and CRITICAL emphasis

## 2026-08-08

- perf: prompt studio 3-way parallel generation with partitioned system prompts

## 2026-08-08

- fix: move playwright from excludes to hiddenimports, use top-level import

## 2026-08-08

- fix: move playwright.sync_api import to module top-level for PyInstaller traceability
- fix: add playwright.sync_api to hiddenimports for desktop EXE

## 2026-08-08

- fix: slide image save uses system Chrome/Edge browser, 4K resolution

## 2026-08-08

- fix: exclude data/debug/ from PyInstaller hiddenimports + fix IndentationError in ppt_service.py

## 2026-08-08

- fix: add column_id subdirectory to last_system_prompt.txt debug path for tab isolation

## 2026-08-08

- debug: add diagnostic logging for structural page code-fill path tracing

## 2026-08-08

- fix: _t() dead default parameter + force_regenerate NameError
- fix: batch PPT pipeline missing project_id in _stage2_structure() call

## 2026-08-08

- fix: batch progress bar invisible — increase height 4→8px, darker track, add % text in header

## 2026-08-08

- fix: use _sched.set_jwt_secret() instead of undefined set_jwt_secret in startup event

## 2026-08-07

- fix: unify scheduler import path — desktop_main.py and app.py must use same 'batch.scheduler' module name to avoid dual-instance JWT/port mismatch

## 2026-08-07

- fix: desktop EXE fixes — ffmpeg _MEIPASS fallback, SSL certifi, JWT secret sync, textarea overflow

## 2026-08-07

- fix: add frozen BASE_DIR handling to all remaining files that used __file__

## 2026-08-07

- fix: add _MEIPASS fallback for portable EXE when external resources not found
- fix: unify frozen BASE_DIR to os.path.dirname(sys.executable) across all services
- fix: PPT_CACHE_DIR and EXPORT_DIR now use writable path in frozen mode
- fix: svg_designer.py BASE_DIR frozen mode + project-based output naming

## 2026-08-07

- fix: ppt_service.py BASE_DIR now handles PyInstaller frozen mode
- build: EXE with PPT-TRACE-v2 print-based debugging, commit 1ced68d

## 2026-08-07

- fix: BUILD-MARKER + PPT-TRACE-v2 using print() for frozen EXE debugging
- build: EXE with PPT-TRACE debug logging, commit 2c4d607

## 2026-08-07

- fix: add PPT-TRACE debug logging to trace pipeline decisions in frozen EXE
- fix: auto-fill provider_id and model from first enabled LLM provider when empty

## 2026-08-07

- fix: Stage 3 model falls back to Stage 2 model when not saved
- Revert "fix: frozen mode uses backend/data/ instead of dist/data/ for database"

## 2026-08-07

- fix: frozen mode uses backend/data/ instead of dist/data/ for database

## 2026-08-07

- fix: restore original preview-template.html from git history (deleted in 2fb38ad)

## 2026-08-07

- fix: add preview-template.html with JS slides rendering, include in all builds

## 2026-08-07

- fix: filter batch scheduler slide-list files from project output list

## 2026-08-07

- fix: persist run_dirs.json and default save_path to EXE dir on desktop

## 2026-08-07

- fix: hide ffmpeg console window on Windows via CREATE_NO_WINDOW

## 2026-08-07

- fix: include requirements.txt, default_download_urls.json, .env.example in server build
- fix: add Stop-Process before PyInstaller, fix hiddenimports injection syntax

## 2026-08-07

- fix: switch build packaging from blacklist to whitelist

## 2026-08-07

- fix: exclude runtime data dirs (videos, downloads, backups, etc.) from server build

## 2026-08-07

- fix: build_server.ps1 excludes venv at copy time, not post-copy

## 2026-08-07

- fix: license offline fallback now checks locally-cached expires_at
- build: add unified build_all.ps1 entry point, enforce in CLAUDE.md
- build: auto-discover backend modules for PyInstaller, add verification to both build scripts

## 2026-08-07

- fix: license expiration now checked on every API call, displayed in settings

## 2026-08-07

- fix: wizard always dismissible, re-pops on next generate if no provider
- fix: batch scheduler port mismatch — add _initialized guard, startup defaults to 8767

## 2026-08-07

- fix: import setOnNoProvider directly instead of api.setOnNoProvider
- fix: check LLM provider at generation time instead of login

## 2026-08-07

- feat: force LLM provider setup after fresh install

## 2026-08-06

- Remove download URL fields from Settings page — managed via KeyGen only

## 2026-08-06

- fix: EXE fetches live download URLs from activation server at runtime

## 2026-08-06

- fix: embed download URLs in EXE during build via default_download_urls.json

## 2026-08-06

- feat: add download URL fields to Settings page for manual configuration

## 2026-08-06

- fix: add more activation DB paths for PyInstaller EXE download URLs

## 2026-08-06

- fix: sync download URLs from activation server to main backend settings table
- fix: check both /opt/ and /root/ paths for activation db
- fix: read download URLs from activation DB via sqlite3, print errors to stderr
- fix: add detailed debug logging for download URL merge

## 2026-08-06

- fix: add success logging for activation server download URL merge

## 2026-08-06

- fix: read download URLs from activation server via HTTP instead of direct SQLite

## 2026-08-06

- fix: connect KeyGen download URL settings through activation server to frontend
- feat: add right-click context menu (cut/copy/paste/select all) to all KeyGen input fields
- feat: KeyGen local config persistence + auto-load site config on tab switch
- feat: add download URL fields to KeyGen site config tab, with save/load via /api/settings

## 2026-08-06

- fix: validate download URLs with safeUrl to prevent XSS in href

## 2026-08-06

- feat: download links on sidebar now configurable via settings (download_desktop_url/download_server_url); remove download row from login page

## 2026-08-06

- feat: download links on sidebar now configurable via settings (download_desktop_url/download_server_url); remove download row from login page

## 2026-08-06

- feat: double-click EXE when already running just opens browser instead of error
- fix: _copy_seed_configs auto-loads from JSON when seed rows are empty (pre-existing DBs)

## 2026-08-06

- fix: change misleading "加载中..." to "暂无配置" for empty speech/tts configs in workspace settings

## 2026-08-06

- fix: remove all hardcoded seed configs from database.py, load from default_workspace_configs.json as single source of truth

## 2026-08-06

- feat: complete emoji sweep — all UI emojis replaced with SVG icons across entire frontend
- feat: sidebar emoji icons replaced with clean SVG icons
- fix: 默认工作区配置替换为一勺笔录的配置
- fix: default workspace改名一勺笔录 + 研发端口8767 + license豁免
- fix: exempt /api/auth/needs-setup and /api/auth/setup from license check

## 2026-08-06

- feat: first-run setup wizard — user sets own password instead of random initial password

## 2026-08-06

- fix: CRITICAL QA fixes — enabled=1 on create, filter disabled from styles, populate created_by

## 2026-08-06

- build: server + desktop packages with template CRUD fixes

## 2026-08-06

- fix: /api/ppt/styles now includes DB-only templates so they appear in stage 3 selector

## 2026-08-06

- fix: import conflict dialog now supports rename — enter new style_id or leave blank to overwrite
- fix: new templates now visible in TemplateManager — merge DB-only styles into YAML list
- fix: template export ZIP timestamp error — use writestr() instead of write()

## 2026-08-06

- fix: template CRUD endpoints use Pydantic models instead of dict/Body

## 2026-08-06

- feat: template CRUD + import/export — 5 new endpoints + UI

## 2026-08-05

- fix: member login redirect to search page, cover-thumb skip project check, card click goes to /app/booklets
- fix: cover-thumb allows all booklets (not just recommended), validate homepagePath against // prefix
- fix: middleware uses get_db() instead of nonexistent SessionLocal(), member login respects homepage_path
- fix: member login redirects to homepage_path/search instead of /app backend

## 2026-08-05

- fix: use real newline in homepage middleware instead of literal \n text
- fix: landing page card aspect ratios + nginx client_max_body_size

## 2026-08-05

- fix: restore ?token= param for cover-thumb iframe auth (no cookie support in JWT middleware)

## 2026-08-05

- fix: add allow-same-origin to cover iframe sandbox so cookies are sent

## 2026-08-05

- fix: remove JWT from cover-thumb URL — rely on same-origin cookies

## 2026-08-05

- feat: public cover-thumb endpoint + LandingPage uses real iframe covers

## 2026-08-05

- fix: SessionLocal → get_db() in public_list_booklets endpoint

## 2026-08-05

- feat: add /search route + sidebar links, show header links based on login state

## 2026-08-05

- fix: f-string backslash syntax error — extract replace to variable (Python <3.12 compat)

## 2026-08-05

- feat: public landing page — brand hero + Google-style search + booklet grid

## 2026-08-05

- fix: XSS hardening — use json.dumps for __HOMEPAGE_PATH__ injection

## 2026-08-05

- feat: customizable homepage path via admin settings

## 2026-08-05

- feat: save slide images at 2x resolution (2560x1440) via device_scale_factor=2

## 2026-08-04

- fix: import generates fresh IDs to avoid UNIQUE constraint on cross-workspace import

## 2026-08-04

- fix: workspace config export/import — pass wid as string not Number

## 2026-08-04

- fix: SQL injection hardening — validate config columns against allowlist on import
- feat: workspace config export/import — download/upload JSON configs

## 2026-08-04

- fix: enforce mandatory root prompt keys in Prompt Studio generation

## 2026-08-04

- fix: col3 outline table body preserves all rows via configurable body_rule

## 2026-08-04

- fix: replace alert() with custom toast for purchase disabled notice
- feat: purchase enable/disable toggle in KeyGen station config
- fix: remove sidebar pricing HTML and KeyGen pricing editor, now managed by plan_types

## 2026-08-03

- chore: build stamp after review fixes (511bccc)

## 2026-08-03

- fix: code review fixes — auth header, path validation, phone regex, polling

## 2026-08-03

- fix: TS type mismatch in PurchasePage getQrcodeUrls + build stamp

## 2026-08-03

- feat: semi-automated sales system — purchase page, order management, plan config

## 2026-08-03

- fix: don't delete PyInstaller output when staging exe is the original

## 2026-08-03

- fix: skip staging copy when PyInstaller output is already YishaoAgent.exe

## 2026-08-03

- fix: stop using Chinese brand name as PyInstaller output filename

## 2026-08-03

- fix: use ASCII-safe YishaoAgent-Portable.exe instead of Chinese filename

## 2026-08-03

- fix: call set_jwt_secret() before batch_init() in __main__ block

## 2026-08-03

- fix: 3 review findings — JWT key sync, connection pool revert, NSIS correctness

## 2026-08-02

- fix: commercial readiness — P0 security + P1 resilience + P2 packaging

## 2026-08-02

- fix: HTML editor regenerate now bypasses slide cache by default
- fix: remove source materials from project file list
- fix: project list sort by updated_at only, file list shows time not just date
- fix: sort project file list by creation time oldest first

## 2026-08-01

- fix: remove all outline auto-save from project file list

## 2026-08-01

- fix: remove outline auto-save from batch scheduler, keep slide list only

## 2026-08-01

- fix: move backfill endpoint before catch-all GET + add batch auto-save

## 2026-08-01

- fix: add permission check back to backfill endpoint, match frontend guard

## 2026-08-01

- feat: add one-click backfill to save all project step content to file lists

## 2026-08-01

- feat: auto-save step3 outline and PPT slide list to project files

## 2026-08-01

- feat: auto-save generated doc to project file list after generation

## 2026-08-01

- build: regenerate server zip and desktop installer (backup-full fix)

## 2026-08-01

- fix: exclude .env files from full backup to prevent secret leakage

## 2026-08-01

- fix: full backup now includes frontend source code and config files

## 2026-08-01

- fix: replace undefined CSS vars and hardcoded hex with theme tokens in author pages

## 2026-08-01

- style: unify mobile page UI with site conventions

## 2026-08-01

- style: unify mobile page UI with site conventions

## 2026-08-01

- feat: replace submissions filter dropdown with sub-tabs + pagination
- fix: solid white background for dialogs + simplify recipe approve UI
- fix: move download endpoint before SPA catch-all to prevent route interception
- feat: show and upload author photo in edit dialog
- feat: replace photo URL input with local file upload; serve images inline
- feat: show submission content, attachments and copy button in member center
- fix: download endpoint always registered + copy button for recipe description

## 2026-08-01

- fix: approve only marks status, no auto project creation; file upload stores URL in files_json
- feat: display suggested point cost in submission review card

## 2026-08-01

- feat: contract signed date display + secure file upload
- feat: recipe file upload with configurable size limit
- feat: move author contract settings to AuthorManagePage, simplify recipe submission form

## 2026-08-01

- feat: add toggle to enable/disable author contract application

## 2026-08-01

- feat: add contract agreement checkbox before author application

## 2026-08-01

- fix: auto-create workspace for recipe submissions to satisfy FK constraint
- feat: signed author + revenue sharing system with admin review

## 2026-08-01

- fix: prevent log container overflow by constraining card parent with overflow:hidden + maxHeight/minHeight on log

## 2026-07-31

- fix: validate cached HTML starts with '<' to prevent dirty LLM output from entering/resuming from cache

## 2026-07-31

- fix: clear slide cache when outline is regenerated

## 2026-07-31

- feat: PPT generation resume from cache — skip already-generated slides on re-run

## 2026-07-31

- fix: video copy uses resolve_project_storage instead of raw DB field

## 2026-07-31

- fix: use absolute positioning for panel-left to force height constraint

## 2026-07-31

- fix: use height:100% instead of max-height/min-height on panel-left

## 2026-07-31

- fix: remove max-height:100% on panel-left, rely on flex stretch constraint

## 2026-07-31

- fix: structural container fix — max-height on panel-left + stable card height

## 2026-07-31

- fix: split video card into input + action cards so buttons stay visible

## 2026-07-31

- fix: compact video upload UI — side-by-side buttons, load video on mount

## 2026-07-31

- feat: 视频提取支持本地上传，上传/下载结果完全一致（同一ASR管道）

## 2026-07-31

- fix: 项目明细搜索同时匹配project_code编号，不局限于名称
- fix: 网页式页眉LOGO压正文 — :has()替代+选择器绕过footer阻断

## 2026-07-30

- chore: build stamp for c03ab9d (booklet header/footer feature)

## 2026-07-30

- feat: 电子成册文本页可配置页眉页脚（LOGO+三栏+全局变量+页码）
- chore: build stamp for 5ff274d (saveStep await + check_ownership)

## 2026-07-29

- fix: saveStep await API调用，失败时弹错误提示
- chore: build_version for 1294b7c
- fix: 14个编辑端点补check_ownership，内容管理员只能编辑自己项目
- chore: build_version for b005fb4
- fix: check_ownership 移除 user_type==admin 绕过，普通管理员仅能编辑自己项目
- fix: Stage1 清空后可保存空内容，去掉保存按钮空文本禁用限制
- chore: build_version for f6fad00
- revert: check_ownership 恢复 user_type=="admin" 绕过，编辑权限由 require_perm 入口控制
- chore: build_version for beddfc3
- feat: 项目卡片显示创建者姓名(created_by_name)
- fix: check_ownership 移除 user_type=="admin" 绕过，恢复按 project.edit_all 权限判断
- fix: batch summary only shows current user's own batch, not others
- fix: disable step selectors for unselectable projects in batch execute
- fix: frontend checkbox uses project.edit_all instead of user_type==admin
- fix: move uid definition before its first use in api_batch_execute
- fix: use project.edit_all permission instead of user_type==admin for batch endpoints
- debug: add diagnostic logging to create_project + api_batch_active
- debug: add diagnostic logging to api_batch_active

## 2026-07-29

- feat: project list shows active batch status, in-batch projects disabled

## 2026-07-29

- fix: per-user batch exclusion instead of per-workspace, non-admins see own batches

## 2026-07-29

- fix: per-user batch exclusion instead of per-workspace, non-admins see own batches

## 2026-07-29

- fix: type error in disabled prop
- fix: batch execute admin bypass + cancel fail-closed + show project creator

## 2026-07-29

- feat: workspace batch mutual exclusion + cancel ownership check

## 2026-07-28

- fix: get_project_active_batch 不再把已完成批次/已跳过项目视为活跃

## 2026-07-28

- fix: toast → alert（项目使用 alert 而非 toast 组件）
- fix: 批量执行拒绝 end_time <= start_time 的时间窗口

## 2026-07-28

- fix: created_by 而非 author_id 校验项目归属 + 错误日志防泄露

## 2026-07-28

- fix: author_id 校验兼容历史项目（空author_id也放行）

## 2026-07-28

- fix: start_batch 同步写DB防丢失 + _update_db 加错误日志

## 2026-07-28

- fix: cancel_batch 增加 DB fallback，服务器重启后也能取消批次
- build: server zip (ee35acd — DB fallback batch_id 修复)

## 2026-07-28

- fix: get_batch_status DB fallback 返回 id 而非 batch_id，前端 .slice() 崩溃
- build: server zip (d1fa533 — 批量摘要卡片 + workspace隔离)

## 2026-07-28

- feat: 批量处理活跃批次摘要卡片 + workspace隔离 + owner校验

## 2026-07-28

- build: server zip + desktop (de63604 — 分类筛选 + 项目列表增强)

## 2026-07-28

- feat: 电子成册内容选择器增加分类筛选 + 项目列表显示作者/文件数/积分

## 2026-07-28

- fix: useState 放在组件外部导致 React 初始化崩溃，移入组件内部
- feat: 项目管理列表50/100/全部分页 + 右键新窗口打开

## 2026-07-28

- feat: 工作区顶部增加←返回按钮，导航回项目卡片列表
- fix: require_perm 中 project.view_all 隐含 view_own，修复批量预警403静默失败
- fix: get_project_active_batch 移除不存在的 project_name 列，修复运行中批量不显示预警
- fix: stopped批量项目不显示'正在执行'预警，允许手动编辑
- style: 批量管理字号缩小，对齐主站列表风格

## 2026-07-27

- feat: 批量管理分页(20/50/全部) + stopped状态项目预警
- fix: get_project_active_batch DB回退也查stopped状态

## 2026-07-27

- fix: batch crash保护 + stopped状态显示, 演讲稿/排版配置只读工作区

## 2026-07-27

- fix: Step4 演讲稿 temperature 0.7→0.3 + 去掉内容截断，与手动一致
- fix: add auth to /api/batch/active endpoint

## 2026-07-27

- fix: 项目批量状态检测加DB回退 + 重启时清理遗留running状态

## 2026-07-27

- feat: 批量页自动检测运行中的批次

## 2026-07-27

- feat: 批量执行界面添加课件模板选择器

## 2026-07-27

- fix: 批量执行器按 tab 独立读取用户保存的模板选择

## 2026-07-27

- fix: add verify_project_access to batch status endpoint

## 2026-07-27

- fix: add project existence check to batch status endpoint

## 2026-07-27

- feat: batch execution warning on project detail page

## 2026-07-27

- fix: totalSteps NaN — payload[pid] is {steps,step2_sources} not array

## 2026-07-27

- refactor: batch scheduler — HTTP dispatcher with per-tab parallel pipelines

## 2026-07-27

- fix: batch executor step names aligned to ProjectPage.tsx

## 2026-07-27

- fix: batch_executor reads original pipeline configs, zero hardcoded prompts
- fix: batch executor model name — split provider_id:model format from _model_s2_sop
- fix: Step 4 speech source — use Step 2 documents, not Step 3 PPTs
- fix: Step 2→3 cascade filter + Step 1 radio disabled logic + raw/step1 cross-check

## 2026-07-27

- feat: Step 4 批量执行简化 — 删除演讲口播，演讲稿单选来源

## 2026-07-27

- fix: batch Step 1 log — "正在批量整理文档/视频/文件" instead of "正在整理: text"

## 2026-07-27

- fix: Step 1 data source — use step1_xxx (AI-organized) not raw_xxx (raw input); Step 1 actually calls LLM to process raw content

## 2026-07-27

- feat: batch execute — step1 radio single-select, step4 source selector, sub-TAB status, project conflict detection

## 2026-07-27

- fix: move batch_jobs table creation from migration to init_db() for every-startup execution
- fix: checkbox = select rows to import, per-row delete button instead of batch delete
- fix: batch import — workspace_id ordering, step_results PK, db lock, decimal points, response mapping, row select/delete
- fix: batch import — use load_workbook for reading Excel and support decimal point values

## 2026-07-27

- fix: BatchDialog uses project's dialog-overlay class instead of nonexistent modal-overlay

## 2026-07-27

- fix: move batch API routes before SPA catch-all to prevent HTML responses

## 2026-07-27

- feat: batch import + execute — Excel bulk import and scheduled batch generation

## 2026-07-27

- build: server zip (fac413f — 分段自动保存)

## 2026-07-26

- feat: 文案分割段落自动保存/恢复 — 存为 _tts_segments 到 step_results
- fix: newline 分割模式每行独立一段，不再合并连续非空行

## 2026-07-26

- build: server zip (5016c8c — 文案分割三合一)

## 2026-07-26

- feat: 演讲口播文案分割三合一 — 换行分割/保整行字数分割/段落增删排序

## 2026-07-26

- fix: 下载统计表格列宽调整 — 所属项目/分类/作者/创建者缩窄，下载/阅读次数缩窄

## 2026-07-26

- fix: H5 audio preview not counted — use toPreviewSrc + withToken like image/video
- feat: 统计页明细/会员表头点击切换排序 — 下载次数/阅读次数互切，默认下载降序
- fix: exports 预览（PPT产物）未计入阅读次数 — api_serve_export_file 加 project_id 参数并调用 _incr_view_count
- fix: member stats SQL JOIN 膨胀 — 双 LEFT JOIN 导致笛卡尔积，改用子查询
- fix: _incr_view_count 中 datetime.datetime.utcnow() → datetime.utcnow()，多一层 .datetime 导致 AttributeError
- fix: _incr_view_count 缺少 import uuid as _uuid 导致 NameError 静默失败

## 2026-07-26

- feat: 下载统计增加阅读次数 — view_logs 表 + preview-file 计数 + 前后端展示

## 2026-07-22

- fix: landscape TOC 目录页空白 — stage1 page_type 被 LLM type 覆盖导致跳过代码填充

## 2026-07-22

- fix: _resolve_run_index_html 补齐扫描输出目录回退，与导出端点逻辑对齐

## 2026-07-22

- fix: cover_thumb 缩略图补回 bk-vi body class，课件深色封面不再变白
- fix: landscape TOC 目录页空白 — cards 空时从 key_points 派生
- fix: 画册下载积分扣除移除is_downloadable跳过 + approve_renewal角色升级 + 站点配置系统

## 2026-07-21

- fix: dangerouslySetInnerHTML 加 DOMPurify.sanitize 防 XSS

## 2026-07-21

- feat: 激活服务器站点配置 — 标价说明 + 公告弹窗系统

## 2026-07-21

- fix: 整站备份去重 — base walk已覆盖routers/services，移除重复条目 + strict_timestamps=False

## 2026-07-21

- fix: 整站备份限定目录范围，避免遍历venv/activation_server等导致500

## 2026-07-21

- feat: 整站备份下载 — 数据库+源码+前端打包zip一键下载

## 2026-07-21

- fix: 备份下载改用fetch+token认证，修复25B空文件问题

## 2026-07-21

- feat: 全局设置→一键下载数据库备份按钮

## 2026-07-21

- feat: 部署前自动备份数据库 + 每日备份定时任务

## 2026-07-21

- fix: TOC重新生成空章节 — 移除code-fill路径对active_scheme的依赖 + 补充redo_structure缺失字段

## 2026-07-21

- fix: 重新生成日志轮询间隔 10s→2s + 完成后保留日志显示
- fix: 画册下载积分扣除 + 按钮文案优化

## 2026-07-21

- feat: 画册卡片一键下载按钮（标准页PDF型）

## 2026-07-20

- fix: toPreviewSrc 中文文件名双重编码导致404

## 2026-07-20

- fix: 手机版预览全部文件类型走免解锁端点 + 下载走解锁确认流程

## 2026-07-20

- fix: 手机版预览402 + 下载无反应

## 2026-07-20

- fix: 移除画册卡片副标题行

## 2026-07-20

- fix: 移除画册卡片标题前的书册/PPT图标，封面缩略图已替代其作用

## 2026-07-20

- fix: cover-thumb端点?token=认证修复 — jose导入+app模块引用

## 2026-07-20

- feat: 画册列表卡片使用真实封面缩略图(iframe)替代色块标题
- fix: 画册卡片按钮左推荐/右删除分开对齐，封面缩略图加容器白边

## 2026-07-20

- feat: 画册列表卡片左侧添加封面缩略图

## 2026-07-20

- fix: 会员端推荐画册卡片也显示创建者署名

## 2026-07-20

- fix: 推荐画册列表加owner_name署名 + 管理员视图拆分为我的/用户画册

## 2026-07-20

- feat: 管理员推荐画册功能 — 会员可见推荐画册并引用到自己的册子

## 2026-07-19

- fix: 禁用按钮添加 CSS :disabled 样式 (opacity:0.4 + not-allowed 光标)
- fix: Stage 1 三TAB原始文本卡片溢出 — 移除 flex:1 防日志压盖 + 去诊断日志
- fix: Stage 1 生成所有文案 — 彻底隔离 Stage 2 产出，只取当前TAB右侧整理内容

## 2026-07-19

- fix: Stage 1 生成所有文案严格按当前TAB取源，禁止跨源偷数据

## 2026-07-19

- fix: 全局设置→操作说明编辑器支持全部27章节编辑

## 2026-07-19

- feat: 角色化操作说明书 — 5角色独立手册 + 快速上手双模式 + 9章节种子数据

## 2026-07-19

- fix: 左侧列表恢复显示全部项目(含is_downloadable=0)，下载仍走权限校验
- fix: 恢复 is_downloadable=1 过滤，工作区下拉独立于项目列表
- fix: workspaces 查询误用 download_count 排序导致工作区列表空白

## 2026-07-19

- fix: 下载页工作区筛选显示全部工作区 + 左栏名单行 + 预览框去空白
- fix: 下载页左栏宽度 300→400px 避免品名换行
- feat: 下载页项目筛选改为按工作区筛选 + 明细列表按下载量排序

## 2026-07-19

- feat: 下载页左栏加序号+按下载量排序 + 移除重复项目标签

## 2026-07-19

- feat: 预览防复制+md人读渲染+项目筛选/名称区分 + 会员侧栏隐藏项目管理

## 2026-07-19

- feat: 会员下载页文件预览 — 每文件下载前加预览按钮，弹框按类型渲染（html/图片/音频/视频）

## 2026-07-19

- feat: 会员下载页改版左右分栏 — 左项目清单(搜索+分类筛选+多选) + 右文件明细勾选 + 跨项目批量下载一个zip

## 2026-07-19

- fix: 课件"编辑文字"被 7/16 防复制套件误伤 — 编辑期中和 user-select:none + selectstart 拦截，退出恢复
- chore: dev-log 本地测试令牌文件加入 .gitignore

## 2026-07-19

- feat: A4 电子书固定页 VI 版式自动切换 — 第一章为课件时封面/扉页/目录/封底走 VI A4（primary 纯色禁渐变）+ 删「内容同款配色」卡 + 第④步 flow 草稿固定页缩略图截断修复

## 2026-07-19

- fix: 构建脚本 CHANGELOG 自动追加乱码根治 — git log 输出按 UTF-8 解码（原 GBK 控制台码页误解）+ 多条目按行拼接

## 2026-07-19

- feat: 电子成册「内容同款配色」— 第③步一键取用 HTML 章节 :root 配色作封面主题（后端 custom 分支复用，零新增端点）
- feat: 主题对比度派生变量 --ink/--on-primary（WCAG ≥4.5）— 六套合成模板+前端三处预览统一换色位，深色配色下标题与渐变底文字自动保持可读
- fix: A4 目录条目 <a> 锚链接去默认蓝色下划线（3 个 A4 模板补 .bk-toc-table a 重置，第④步缩略图与合成产物同步生效）
- fix: 第②步文档章节预览只显示一半 — iframe 高度按 body 实测内容高设置并随宽度变化重测（外层单滚动条看全文）

## 2026-07-18

- fix: 预览区 overflowX:hidden + overflowY:auto — 去左右保留上下滚动

## 2026-07-18

- fix: 排序编辑预览 overflowY:auto → hidden，内容自适应无滚动条

## 2026-07-18

- fix: 排序编辑预览消除三层滚动条 — 外层overflow:hidden + iframe scrolling=no

## 2026-07-18

- fix: BookletEditorPage 容器缺少 overflow:hidden 导致外层滚动条

## 2026-07-18

- fix: .panel-right overflow-y:auto → hidden 根除双层滚动条

## 2026-07-18

- fix: 第2/3步右侧预览框消除双层滚动条 — panel-right 覆盖 overflow:hidden

## 2026-07-18

- fix: 修复翻页式预览第2页TOC显示为近正方形 — .bk-toc 的 position:relative 覆盖了 .bk-slide 的 position:absolute

## 2026-07-18

- fix: themes.py/proseSplit.ts 琛ヤ笂 --text-rgb 鍙橀噺鐢熸垚锛屼慨澶?TOC 鐐圭姸杈规/椤电爜棰滆壊涓嶆樉绀?

## 2026-07-18

- fix: 灏侀潰棰勮鏀惧ぇ + 鍘籨esk鑳屾櫙璁╁皝闈㈠～婊frame

## 2026-07-18

- fix: cover_preview绔偣涓嶅悜瀹㈡埛绔繑鍥炲紓甯歌鎯?

## 2026-07-18

- fix: booklet CSS鍙橀噺瀵归綈VI瑙勮寖 + TOC閲嶅啓涓?table>/<tr> + 灏侀潰棰勮寮傚父鏃ュ織

## 2026-07-18

- fix: Step3灏侀潰棰勮鎺ュ叆鍚庣妯℃澘CSS绠＄嚎 + TOC娓愬彉閫忔槑鏀瑰疄鑹插簳

## 2026-07-18

- feat: 鐢靛瓙鎴愬唽鍥哄畾椤垫秷璐归鏍?YAML 瀹屾暣璁捐浠ょ墝 鈥?灏侀潰娓愬彉/鐩綍鍥捐〃鑹?闅旈〉鑿卞舰/灏佸簳闀滃儚

## 2026-07-18

- fix: 绗懀姝?PPT 绔犺妭鏍囬椤垫樉绀虹湡瀹炵缉鐣ュ浘棰勮锛堟浛鎹㈡枃瀛楀崰浣嶇锛?

## 2026-07-18

- fix: 绗憽姝?HTML 绔犺妭棰勮鑷姩缂╂斁 鈥?transform:scale() 閫傞厤瀹瑰櫒瀹藉害 + 浠呯旱鍚戞粴鍔?

## 2026-07-18

- feat: 绗憽姝ョ粺涓€ iframe 鍙鍖栫紪杈戝櫒 鈥?MD/HTML 绔犺妭鍏辩敤 contentEditable 棰勮 + 鏍煎紡宸ュ叿鏍?+ 婧㈠嚭淇

## 2026-07-18

- refactor: 浼氬憳鏈夋晥鏈熸敼涓烘案涔呮湁鏁?+ 缁垂鍏ュ彛鏀逛负绉垎鍏呭€?

## 2026-07-18

- fix: 缈婚〉寮?鏍囧噯椤典骇鐗╁湪 iframe 鍒濇寕杞芥椂鎷嗛〉鑶ㄨ儉锛?36椤碘啋40椤碉級鐨勬祴閲忕珵鎬?

## 2026-07-18

- fix: 绗憿姝ュ皝闈㈠疄鏃堕瑙堝皬鏍峰悓姝?44mm 涓婅竟璺濈増寮忥紙LOGO/涔﹀悕璺濋《绛夋瘮鎹㈢畻锛?

## 2026-07-18

- fix: A4 灏侀潰鍐呭鍖轰笂杈硅窛 22mm鈫?4mm锛堜粎灏侀潰椤碉紝鍏朵粬椤甸潰涓庢媶椤靛嚑浣曚笉鍙橈級

## 2026-07-18

- feat: 鐢靛瓙鎴愬唽 R6 椤甸潰缂栨帓鍗囩骇 鈥?鍥哄畾椤电湡缂╃暐鍥?+ 姝ｆ枃鎷嗛〉閫愰〉闅愯棌/鎺掑簭 + LOGO涓婁紶鏉冮檺淇

## 2026-07-18
- feat: 电子成册 R6 页面编排升级 — 固定页真缩略图 + 正文拆页逐页隐藏/排序(翻页式/标准页生效) + 署名页 LOGO 上传放开登录即可

- fix: 涓嬭浇鎺堟潈缁熶竴瑙ｉ攣濂戠害 鈥?璇曠敤浼氬憳瑙ｉ攣鍚庝竴閿笅杞?403 淇 + 鍏充簬寮圭獥鍔犲瀛楀彿缁熶竴

## 2026-07-18

- fix: 娉ㄥ唽榛樿璇曠敤浼氬憳 + 璧嬭鑹?get-or-create 鈥?淇鏂扮敤鎴锋棤瑙掕壊鐪嬩笉鍒伴」鐩?- docs: CHANGELOG 杩藉姞 7/17 鏋勫缓鏉＄洰

## 2026-07-17

- feat: 绠＄悊鍚庡彴鍥涢」鏀硅繘 鈥?宸ヤ綔鍖哄綊灞炴潈闄?+ 涓嬭浇缁熻鍒涘缓鑰呯淮搴?+ 鏂颁汉绀煎寘娉ㄥ唽鍗冲彂 - docs: dev-log 琛?R5 灞呬腑/婊氬姩鏉′慨澶嶄笌閮ㄧ讲璁板綍

## 2026-07-17

- fix: 棰勮妗嗗崟婊氬姩鏉?+ 缈婚〉寮忛殣钘忕缉鏀炬媺鏉?

## 2026-07-17

- fix: 鎴愬唽浜х墿棰勮灞呬腑 + 鍙暀绾靛悜婊氬姩鏉?- docs: dev-log 琛?R4 涓夌鍚堟垚鏂瑰紡璁板綍

## 2026-07-17

- feat: 鐢靛瓙鎴愬唽涓夌鍚堟垚鏂瑰紡 鈥?缈婚〉寮?缃戦〉寮?鏍囧噯椤?+ 闀挎鏂囪嚜鍔ㄦ媶椤?- docs: 鐢靛瓙鎴愬唽 R2/R2-H/R3 寮€鍙戞棩蹇楀綊妗?

## 2026-07-17

- fix: 鐢靛瓙鎴愬唽鍚戝鏈闅愯棌銆屼笅涓€姝ャ€嶆寜閽紙宸叉槸鏈€鍚庝竴姝ワ級

## 2026-07-17

- feat: 鐢靛瓙鎴愬唽鏂板绗懀姝ャ€岄〉闈㈢紪鎺掋€嶁€?閫愰〉闅愯棌/绔犺妭鍐呮帓搴?鍥哄畾椤甸殣钘?

## 2026-07-17

- feat: 鐢靛瓙鎴愬唽瀵煎叆 Word/Excel 鑷姩杞?Markdown - fix: 鐢靛瓙鎴愬唽绗竴杞蛋鏌ヤ慨澶?鈥?甯冨眬婧㈠嚭/瀵屾枃鏈伐鍏锋爮/涓婚鍖栭瑙?涓ょ鍚堟垚鏂瑰紡 - feat: 鐢靛瓙鎴愬唽鍓嶇 鈥?鍥涙鍚戝缂栬緫鍣?+ 绠＄悊绔?浼氬憳绔叆鍙ｏ紙Phase 4-5锛?- fix: 鐢靛瓙鎴愬唽瀹夊叏鍔犲浐 鈥?CSS 娉ㄥ叆涓?XSS 鍓ョ - feat: 鐢靛瓙鎴愬唽鍚庣 鈥?booklets 琛?+ 9 涓?API + 瑁呴厤寮曟搸锛圥hase 1-3锛?

## 2026-07-17

- feat: 鏄庣粏椤靛瓙椤电鐢熸垚涓彸鎸囩ず 鈥?鎵归噺鐢熸垚鏃跺悇鏂囨。鐘舵€佷竴鐩簡鐒?

## 2026-07-17

- fix: 璁稿彲璇佹満鍣ㄦ寚绾?v2 鈥?鍓旈櫎MAC绛夋槗鍙橀」锛屾潨缁濇寚绾规紓绉昏鎶ユ湭婵€娲?

## 2026-07-17

- fix: 鐣岄潰椁愰ギ璇嶆眹涓€у寲 鈥?鏀寔澶氳涓氬満鏅?- fix: 鎻愮ず璇嶅伐浣滃澶氳涓氶€傞厤 鈥?9妲戒綅缁撴瀯濂戠害 + 搴旂敤鏀瑰師瀛愭浛鎹?

## 2026-07-17

- feat: 銆屽叧浜庤蒋浠躲€嶅脊绐?鈥?鐧诲綍椤靛簳閮?绠＄悊绔?浼氬憳绔晶杈规爮鍏ュ彛锛屽唴瀹瑰湪鍏ㄥ眬璁剧疆缂栬緫

## 2026-07-17

- feat: 浼氬憳涓嬭浇椤靛姞鍒嗛〉(姣忛〉40鏉?锛屾悳绱?绛涢€変綔鐢ㄤ簬鍏ㄩ儴鏁版嵁鍚庡啀鍒嗛〉

## 2026-07-17

- feat: 浼氬憳绔」鐩崱鐗囧悓姝ユ敼鐗?鈥?鍚嶅瓧涓嶭OGO鍚岃銆佷袱琛岀畝浠嬨€侀璋辨暟閲?

## 2026-07-17

- fix: 鏄庣粏琛屻€岎煋?杈撳嚭銆嶆寜閽敼涓恒€岎煋?涓嬭浇銆嶏紝鍚箟鏇寸洿瑙?

## 2026-07-17

- feat: 涓嬭浇缁熻涓や釜Tab鍜屼綔鑰呯鐞嗗垪琛ㄥ姞鍒嗛〉(姣忛〉20鏉?锛屼綔鑰呰〃鍔犲簭鍙峰垪

## 2026-07-17

- feat: 涓嬭浇缁熻鏄庣粏琛ㄥ姞鑿滆氨缂栧彿/鎵€灞為」鐩垪锛涗細鍛樿〃鍔犲簭鍙?鍏呭€奸噾棰?鍓╀綑绉垎/娑堣€楃Н鍒?

## 2026-07-17

- feat: 棣栭〉椤圭洰鍗＄墖鏀圭増 鈥?鍚嶅瓧涓嶭OGO鍚岃锛屼腑闂存樉绀轰袱琛岀畝浠嬶紝搴曢儴鏄剧ず椋熻氨鏁伴噺

## 2026-07-16

- feat: 鏄庣粏宸ヤ綔鍖洪《閮?鍚嶅瓧鏃?鍔犲垎绫?浣滆€呬笅鎷夛紝閫夋嫨鍗充繚瀛?

## 2026-07-16

- fix: 鍒嗙被/浣滆€呮煡璇㈢鐐瑰姞鐧诲綍鏍￠獙 + 鍒犻櫎鍒嗙被娓呭紩鐢ㄩ檺瀹氬伐浣滃尯鑼冨洿

## 2026-07-16

- feat: 鏄庣粏鍒嗙被 + 浣滆€呮巿鏉冪讲鍚?+ 涓嬭浇缁熻鎸夊垎绫?浣滆€呯瓫閫夋眹鎬?

## 2026-07-16

- fix: 璇句欢杈撳嚭闅愯棌PPT閫愰〉鎴浘(slide_NN.png)锛屾枃浠跺垪琛ㄥ拰涓嬭浇椤靛彧鏄剧ずHTML璇句欢

## 2026-07-16

- fix: 鏂囦欢鍒楄〃绱犳潗鏉＄洰鍒犻櫎澶辫触 鈥?绱犳潗鏄疍B璁板綍闈炵鐩樻枃浠讹紝鍒犻櫎鏀硅蛋deleteMaterial鎺ュ彛

## 2026-07-16

- fix: /api/download璺敱瑁呴グ鍣ㄩ敊鎸傚湪_check_unlock_and_log杈呭姪鍑芥暟涓婏紝瀵艰嚧TXT/MP3/MP4鍏ㄩ儴涓嬭浇422澶辫触

## 2026-07-16

- fix: 涓嬭浇椤垫槑缁嗙己HTML/PPT瀵煎嚭鏂囦欢 鈥?澶嶇敤_list_project_files缁熶竴鏂囦欢鍒楄〃 + 宸茶В閿侀」鐩粯璁ゆ姌鍙?

## 2026-07-16

- feat: 涓嬭浇椤垫悳绱?绛涢€?鍏ㄩ儴/宸茶В閿?鏈В閿? + 椤圭洰鍒楄〃宸茶В閿佹爣绛?

## 2026-07-16

- fix: ProjectDashboard鍗曟枃浠朵笅杞芥湭璧扮Н鍒嗚В閿佹鏌?

## 2026-07-16

- fix: 涓嬭浇椤甸潰鍗曟枃浠朵笅杞芥湭妫€鏌ョН鍒嗚В閿?

## 2026-07-16

- feat: 浼氬憳涓€閿笅杞介〉闈?鈥?渚ц竟鏍忎笅杞芥枃浠跺叆鍙?+ 鍚庣downloadable-projects绔偣 - build: regenerate server.zip + desktop with points config (74535f2)

## 2026-07-16

- fix: 鎵归噺鍔犵Н鍒嗙己灏憍10杞崲 + 鍚庣娑堟伅鏄剧ず绉垎鑰岄潪deci + 涓嬭浇缁熻椤礥I瀵归綈

## 2026-07-16

- refactor: 涓嬭浇缁熻浠庣敤鎴风鐞員ab鎷嗕负鐙珛椤甸潰锛屼晶杈规爮鏂板鍏ュ彛

## 2026-07-16

- feat: 鎵归噺澧炲姞绉垎鍔熻兘 鈥?鍚庣batch-grant-points绔偣 + 鍓嶇鎸夐挳+瀵硅瘽妗?

## 2026-07-16

- fix: 寮€鍙戜綋楠屽憳鏉冮檺瀹屽杽 + 鎻愮ず璇嶅伐浣滃 + PromptStudio涔辩爜淇

## 2026-07-16

- fix: 绉垎缂栬緫鏀圭敤鉁撯湑鎸夐挳 + 寮€鍙戜綋楠屽憳鍏佽璁块棶浼氬憳涓績

## 2026-07-16

- fix: 椤圭洰绉垎缂栬緫 onBlur 涓?Enter 鍐茬獊淇

## 2026-07-16

- feat: 椤圭洰绠＄悊椤电Н鍒嗛厤缃?+ 浼氬憳涓績淇

## 2026-07-16

- fix: 鍒版湡鏃堕棿缂栬緫鎺ュ彛鏀逛负async + 绉垎娴佹按绫诲瀷涓枃鏄剧ず

## 2026-07-16

- fix: 绉婚櫎璁板綍浠樿垂鍔熻兘锛岀Н鍒嗙鐞嗗璇濇鏀逛负鍙紪杈戝埌鏈熸椂闂?

## 2026-07-16

- fix: 浠樻鏄庣粏姣忕瑪璁板綍鍚勮嚜鏄剧ず褰撴椂姹囩巼锛宺ate鍒楁寔涔呭寲

## 2026-07-16

- fix: 缁垂瀹℃壒澧炲姞纭瀵硅瘽妗嗭紝鏄剧ず浠樻淇℃伅鍜岀Н鍒?

## 2026-07-16

- fix: 缁垂鏀逛负闇€瑕佺鐞嗗憳瀹℃壒

## 2026-07-16

- fix: 缁垂瀹℃壒+浠樻鏄庣粏鏄剧ず绉垎

## 2026-07-16

- fix: 璧犻€佺Н鍒嗗紓甯镐俊鎭劚鏁忥紝閬垮厤鍐呴儴缁嗚妭娉勯湶

## 2026-07-16

- feat: 绉垎绠＄悊澧炲姞璧犻€佺Н鍒嗗姛鑳?+ 浜ゆ槗璁板綍姹囩巼

## 2026-07-16

- feat: 瀹℃壒瀵硅瘽妗嗘樉绀?缂栬緫绉垎 + 璁剧疆椤电Н鍒嗘崲绠楅厤缃?

## 2026-07-16

- build: regenerate server.zip + desktop after paid approval fix (e360ae8)

## 2026-07-16

- fix: 浠樿垂娉ㄥ唽鎭㈠瀹℃壒娴佺▼ 鈥?璇曠敤鑷姩鎵瑰噯锛屼粯璐圭瓑寰呯鐞嗗憳瀹℃牳浠樻

## 2026-07-16

- build: regenerate server.zip + desktop after approval removal (2a0bff5)

## 2026-07-16

- refactor: 鍙栨秷浼氬憳娉ㄥ唽瀹℃壒 鈥?鏂颁細鍛樿嚜鍔ㄦ壒鍑嗭紝绔嬪嵆鐢熸晥

## 2026-07-16

- docs: dev-log 2026-07-16 鈥?绉垎绯荤粺寤鸿鍏ㄨ褰?- build: regenerate server.zip with points admin UI (commit ea61bbe)

## 2026-07-16

- feat: 绉垎绠＄悊鍚庡彴 鈥?鐢ㄦ埛绉垎鏌ョ湅/淇敼 + 涓嬭浇缁熻 + init_db杩佺Щ淇 - build: regenerate server.zip with TOCTOU fix (commit 60c9d29)

## 2026-07-16

- fix: atomic UPDATE in _deduct_points to prevent TOCTOU race condition

## 2026-07-16

- feat: 绉垎绯荤粺 鈥?鏁版嵁搴撱€丄PI銆侀槻澶嶅埗銆佸墠绔細鍛樼绉垎鏄剧ず - build: 閲嶆柊鏋勫缓 server.zip锛岀粦瀹氭渶缁?commit 03f14ec

## 2026-07-16

- fix: 鍘绘帀鐢ㄦ埛鍚岪鍓嶇紑 + 鍥為€€HTML涓嬭浇鐨勯敊璇慨澶?

## 2026-07-16

- chore: 娓呯悊璇彁浜ょ殑涓存椂鏂囦欢 - fix: HTML涓嬭浇鎵嬫満宸︿晶閬尅 鈥?transform:scale() 鏇挎崲涓?zoom 灞炴€?

## 2026-07-16

- fix: HTML涓嬭浇椤甸潰鎵嬫満绔乏渚ц閬尅 鈥?body娣诲姞width:100vw绾︽潫甯冨眬瀹藉害

## 2026-07-16

- fix: renewal verification uses /api/member/login instead of /api/auth/login

## 2026-07-16

- fix: verify credentials at step 0 in renewal flow instead of deferring to submit

## 2026-07-16

- feat: 鎵嬫満绔悓姝ユ闈㈢鍔熻兘 鈥?绠＄悊绔?椤逛慨澶?+ 涓汉涓績浠樻璁板綍 + 娉ㄥ唽椤?

## 2026-07-16

- fix: 鎷掔粷娉ㄥ唽鍚屾椂鍋滅敤璐﹀彿 鈥?is_active=0 + token_version+1锛涘墠绔凡鎷掔粷鐢ㄦ埛闅愯棌鎿嶄綔鎸夐挳

## 2026-07-16

- fix: 鎵归噺鐢ㄦ埛绔偣璺敱椤哄簭 鈥?/users/batch 绉诲埌 /users/{user_id} 涔嬪墠锛岄伩鍏嶈鍙傛暟鍖栬矾鐢辨嫤鎴?

## 2026-07-15

- feat: 鎵归噺缂栬緫鐢ㄦ埛 鈥?澶氶€?鎵归噺鏀瑰埌鏈?鍚敤鍋滅敤/鍒犻櫎

## 2026-07-15

- fix: 浠樻鏄庣粏鍒嗛〉+鎼滅储 鈥?20鏉?椤碉紝鏀寔濂楅鍚?鍗曞彿/澶囨敞鎼滅储锛?00ms闃叉姈

## 2026-07-15

- fix: reject_upgrade 涔熶娇鐢?[宸叉嫆缁漖 鍓嶇紑鏍囪

## 2026-07-15

- fix: reject_member 璁剧疆 recorded_by + my-payments 鍖哄垎宸叉嫆缁濈姸鎬?

## 2026-07-15

- fix: 瀹℃壒绯荤粺閲嶆瀯 鈥?鎷掔粷鍖哄垎娉ㄥ唽/缁垂 + 鍗囩骇鎷掔粷 + 浼氬憳鐢宠璁板綍

## 2026-07-15

- chore: 鑷姩鏇存柊 CHANGELOG + server.zip (鐧诲綍閲嶅畾鍚戜慨澶?v2)

## 2026-07-15

- fix: 浼氬憳鐧诲綍鏀圭敤娓叉煋闃舵 Navigate 閲嶅畾鍚戯紝閬垮厤 useEffect 绔炴€?- chore: 鑷姩鏇存柊 CHANGELOG + server.zip (鐧诲綍璺宠浆淇)

## 2026-07-15

- fix: 浼氬憳鐧诲綍鍚庤烦杞け璐?鈥?绉婚櫎鍙岄噸瀵艰埅瀵艰嚧鐨勭珵鎬佹潯浠?- chore: 鑷姩鏇存柊 CHANGELOG + server.zip (绉婚櫎 approval_note 杩斿洖鍊?

## 2026-07-15

- fix: list_users 涓嶅啀杩斿洖 approval_note锛堝凡杩佺Щ鑷?payment_records.note锛?- chore: 鑷姩鏇存柊 CHANGELOG + server.zip (瀹℃壒鎰忚杩佺Щ)

## 2026-07-15

- fix: 瀹℃壒鎰忚绉昏嚦 payment_records.note锛岃窡闅忎粯娆炬槑缁嗚€岄潪鐢ㄦ埛 - chore: 鑷姩鏇存柊 CHANGELOG + server.zip (缁垂瀹℃壒淇)

## 2026-07-15

- fix: 娲昏穬浼氬憳缁垂鍚庡湪绠＄悊鍛樺鎵瑰垪琛ㄤ笉鍙 - chore: 鑷姩鏇存柊 CHANGELOG + server.zip (娉ㄥ唽棰戞帶淇)

## 2026-07-15

- fix: 娉ㄥ唽棰戞帶绉昏嚦鏍￠獙涔嬪悗锛岄伩鍏嶆棤鏁堟彁浜ゆ秷鑰楁鏁?

## 2026-07-15

### 修复
- **手机号校验**：注册时手机号必须恰好 11 位数字（中国手机号标准），不再接受 7-15 位
- **会员中心续费按钮**：到期提醒区域恢复"续费 →"功能按钮，不再显示静态"请联系管理员"文案
- **构建版本追踪**：`/api/version` 接口新增 `build_commit` 和 `build_time` 字段，用于比对本地与服务器版本是否一致

### 新增
- **客服联系方式**：注册、登录、续费、成功页显示管理员设置的联系方式
- **手机号必填**：会员注册强制填写手机号（用于审批联系与退款）

## 2026-07-14

### 新增
- **PC 端审批筛选**：会员审批页支持按状态筛选（待审批 / 已通过 / 已拒绝 / 全部）
- **审批意见**：通过/拒绝时可填写审批意见，已审批行显示审批意见
- **付款明细弹窗**：审批页和用户管理页均可查看会员付款历史（套餐、金额、支付方式、单号、状态、备注）
- **会员信息增强**：会员列表显示注册日期和手机号
- **超管备注**：超级管理员可给会员添加备注（仅管理员可见，客户不可见）

## 2026-07-12

### 新增
- **手机版第二期**：管理端（用户管理 + 会员审批）+ 会员个人中心（到期时间 + 续费）
- **A2HS 图文引导**：添加到桌面提示
- **会员编辑/删除**：管理员可在手机端编辑和删除会员
- **公开续费页**：未登录用户可通过链接自助续费

### 修复
- 续费不锁有效期内会员
- Chrome 下载乱码
- 套餐 0 元 + 付费会员角色问题
