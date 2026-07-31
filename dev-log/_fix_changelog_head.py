# -*- coding: utf-8 -*-
"""删除 build 脚本刚追加的乱码 2026-07-19 条目（保留手写干净条目及其后全部字节）。"""
from pathlib import Path

p = Path(r"d:\YISHAOAGENT\CHANGELOG.md")
raw = p.read_bytes()
text = raw.decode("utf-8")

lines = text.split("\n")
# 找第一个 ## 2026-07-19 区块；若其内容含 mojibake 标记则整块删除
start = next(i for i, l in enumerate(lines) if l.startswith("## 2026-07-19"))
end = next(i for i in range(start + 1, len(lines)) if lines[i].startswith("## "))
block = "\n".join(lines[start:end])
assert "鈥" in block or "鐢" in block, "first 7/19 block is clean; nothing to remove"
del lines[start:end]
p.write_bytes("\n".join(lines).encode("utf-8"))
print("removed garbled block lines", start, "-", end)
