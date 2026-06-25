---
name: agent-reach
description: >
  Self-contained multi-platform internet search and read skill.
  Zero external dependencies — calls upstream tools (curl+Jina, gh, yt-dlp,
  xreach, mcporter) directly and degrades gracefully when tools are missing.
  Covers: web pages, GitHub, YouTube, Bilibili, Reddit, Twitter/X, XiaoHongShu,
  Douyin, Weibo, WeChat, V2EX, LinkedIn, RSS, Exa web search.
  Use when agent needs to search the web, read a URL, or gather research material.
  Triggers: "search", "read this URL", "搜索", "查一下", "上网搜", "帮我查",
  "search twitter", "youtube transcript", "search reddit", "web search",
  "B站", "bilibili", "小红书", "微博", "V2EX", "research".
allowed-tools:
  - Bash
  - Read
---

# Multi-Platform Search & Read

Self-contained skill for searching and reading across 14+ platforms. No external installer needed — uses upstream CLI tools directly and degrades gracefully when specific tools are absent.

## Probe (run first)

Detect which tools are available before choosing commands:

```bash
bash skills/agent-reach/scripts/probe.sh
```

Output is JSON with two sections:
- `tools`: which CLI tools are on PATH (curl, gh, yt-dlp, xreach, mcporter, python3, feedparser)
- `services`: which services are reachable — `jina` (Jina Reader), `mcporter_servers` (comma-separated list of registered MCP servers, e.g. `"exa,xiaohongshu"`)

**Only use mcporter commands for servers listed in `mcporter_servers`.** For example, if `weibo` is not in the list, the `mcporter call 'weibo.*'` commands below will fail — skip them and use the fallback instead.

If probe itself fails, assume only `curl` and `WebSearch` tool are available.

## Tier 0 — Always Available (curl only)

These work on any machine with `curl`. No setup needed.

### Read any web page (Jina Reader)

```bash
curl -s "https://r.jina.ai/<URL>"
```

Handles: articles, blog posts, documentation, most public web pages. This is the universal fallback for reading any URL.

### Reddit (public JSON API)

```bash
# Search
curl -s "https://www.reddit.com/search.json?q=QUERY&limit=10" -H "User-Agent: ppt-agent/1.0"
# Subreddit hot posts
curl -s "https://www.reddit.com/r/SUBREDDIT/hot.json?limit=10" -H "User-Agent: ppt-agent/1.0"
```

> Server IPs may get 403. Fall back to Exa search (Tier 2) or WebSearch tool.

### V2EX (public JSON API)

```bash
curl -s "https://www.v2ex.com/api/topics/hot.json" -H "User-Agent: ppt-agent/1.0"
curl -s "https://www.v2ex.com/api/topics/show.json?id=TOPIC_ID" -H "User-Agent: ppt-agent/1.0"
```

## Tier 1 — Common CLI Tools

Available on most developer machines. Check probe output before using.

### GitHub (`gh` CLI)

```bash
gh search repos "query" --sort stars --limit 10
gh repo view owner/repo
gh search code "query" --language python
gh issue list -R owner/repo --state open
```

> Fallback: `curl -s "https://r.jina.ai/https://github.com/owner/repo"`

### YouTube / Bilibili (`yt-dlp`)

```bash
# YouTube — metadata
yt-dlp --dump-json "URL"
# YouTube — subtitles
yt-dlp --write-sub --write-auto-sub --sub-lang "zh-Hans,zh,en" --skip-download -o "/tmp/%(id)s" "URL"
# YouTube — search
yt-dlp --dump-json "ytsearch5:query"

# Bilibili — same tool
yt-dlp --dump-json "https://www.bilibili.com/video/BVxxx"
yt-dlp --write-sub --write-auto-sub --sub-lang "zh-Hans,zh,en" --convert-subs vtt --skip-download -o "/tmp/%(id)s" "URL"
```

> Bilibili on servers may get 412. Use `--cookies-from-browser chrome` if available.
> Fallback: `curl -s "https://r.jina.ai/<video_url>"`

### RSS (`python3` + `feedparser`)

```bash
python3 -c "
import feedparser
for e in feedparser.parse('FEED_URL').entries[:5]:
    print(f'{e.title} — {e.link}')
"
```

> If feedparser not installed: `pip install feedparser`

## Tier 2 — Specialized Tools

These unlock platform-specific search. Check probe output — only use if available.

### Exa Web Search (`mcporter`, requires `exa` in mcporter_servers)

```bash
mcporter call 'exa.web_search_exa(query: "query", numResults: 5)'
```

> Best general-purpose web search. Fallback: `WebSearch` tool.

### Twitter/X (`xreach`)

```bash
xreach search "query" -n 10 --json          # search
xreach tweet URL_OR_ID --json                # read single tweet
xreach tweets @username -n 20 --json         # user timeline
xreach thread URL_OR_ID --json               # full thread
```

> Needs cookies configured. Proxy: `xreach search "query" --proxy "http://host:port"`
> Fallback: `mcporter call 'exa.web_search_exa(query: "site:x.com query")'` or Jina Reader for single tweets.

### 小红书 / XiaoHongShu (`mcporter`, requires `xiaohongshu` in mcporter_servers)

```bash
mcporter call 'xiaohongshu.search_feeds(keyword: "query")'
mcporter call 'xiaohongshu.get_feed_detail(feed_id: "xxx", xsec_token: "yyy")'
```

> Requires Docker + login. Fallback: Jina Reader for individual note URLs.

### 抖音 / Douyin (`mcporter`, requires `douyin` in mcporter_servers)

```bash
mcporter call 'douyin.parse_douyin_video_info(share_link: "https://v.douyin.com/xxx/")'
```

> No login needed. Fallback: Jina Reader.

### 微博 / Weibo (`mcporter`, requires `weibo` in mcporter_servers)

```bash
mcporter call 'weibo.get_trendings(limit: 10)'
mcporter call 'weibo.search_weibo(keyword: "query", count: 10)'
```

> No auth required. Fallback: Exa `site:weibo.com` search or Jina Reader.

### LinkedIn (`mcporter`, requires `linkedin` in mcporter_servers)

```bash
mcporter call 'linkedin.get_person_profile(linkedin_url: "https://linkedin.com/in/username")'
```

> Fallback: `curl -s "https://r.jina.ai/https://linkedin.com/in/username"`

### 微信公众号 / WeChat Articles

WeChat articles block Jina/curl. Needs specialized tools (miku_ai for search, Camoufox for reading). Fallback: Exa `site:mp.weixin.qq.com` or `WebSearch`.

## Degradation Strategy

When a tool is missing, degrade — never block:

| Situation | Fallback |
|-----------|----------|
| `mcporter` missing or `exa` not in servers | `WebSearch` tool for web search |
| `xreach` missing | Exa `site:x.com` search, or Jina Reader for single tweet URLs |
| `yt-dlp` missing | Jina Reader: `curl -s "https://r.jina.ai/<video_url>"` |
| `gh` missing | Jina Reader: `curl -s "https://r.jina.ai/<github_url>"` |
| mcporter server not registered (weibo, douyin, etc.) | Jina Reader for URLs, Exa `site:` search, or skip platform |
| `curl` missing | `WebSearch` tool + `WebFetch` tool |
| All tools missing | `WebSearch` tool only — still functional for research |

The minimum viable setup is **zero tools installed** — the agent always has `WebSearch` as the ultimate fallback.

## Troubleshooting

- **Reddit 403**: Server IP blocked. Use Exa search or `WebSearch` tool.
- **Bilibili 412**: IP rate-limited. Try `--cookies-from-browser chrome` or use Jina Reader.
- **Twitter fetch failed**: Use `--proxy` flag, or fall back to Exa `site:x.com` search.
- **mcporter not found**: Most Tier 2 platforms won't work. Fall back to Jina Reader for individual URLs, `WebSearch` for search queries.

## License

This skill's command reference and platform architecture are derived from [Agent Reach](https://github.com/Panniantong/Agent-Reach) by Agent Eyes, licensed under the [MIT License](https://github.com/Panniantong/Agent-Reach/blob/main/LICENSE).
