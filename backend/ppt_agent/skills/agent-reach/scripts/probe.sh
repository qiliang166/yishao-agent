#!/usr/bin/env bash
# Probe available search/read tools and services.
# Outputs JSON showing what's actually usable on this machine.
# Exit 0 always. Caller reads JSON to decide which commands to use.

set -euo pipefail

has() { command -v "$1" &>/dev/null && echo "true" || echo "false"; }

# Check mcporter registered servers
mcp_servers=""
if command -v mcporter &>/dev/null; then
  mcp_servers=$(mcporter config list 2>/dev/null | grep -E "^[a-z]" | tr '\n' ',' | sed 's/,$//')
fi

# Check feedparser
feedparser="false"
if command -v python3 &>/dev/null; then
  python3 -c "import feedparser" 2>/dev/null && feedparser="true"
fi

# Jina Reader: available whenever curl is (no network probe needed — just try it when you use it)
jina=$(has curl)

cat <<EOF
{
  "tools": {
    "curl": $(has curl),
    "gh": $(has gh),
    "yt_dlp": $(has yt-dlp),
    "xreach": $(has xreach),
    "mcporter": $(has mcporter),
    "python3": $(has python3),
    "feedparser": $feedparser
  },
  "services": {
    "jina": $jina,
    "mcporter_servers": "$mcp_servers"
  }
}
EOF
