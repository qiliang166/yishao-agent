# Changelog

## [Unreleased]

### Added
- **llmdoc maintainer documentation**: Add an internal `llmdoc/` documentation hub covering project overview, workflow architecture, maintenance guides, and repository conventions for `ppt-agent` maintainers.
- **agent-reach skill**: Self-contained multi-platform search & read skill (14+ platforms). Zero external dependencies — uses upstream CLI tools (curl+Jina, gh, yt-dlp, xreach, mcporter) directly with tier-based graceful degradation. Includes `probe.sh` for runtime tool detection.
- **MIT LICENSE** for agent-reach skill (derived from [Agent Reach](https://github.com/Panniantong/Agent-Reach) by Agent Eyes).
- **GPT-5.4 OpenCode showcase**: Add the new Xiaomi SU7 deck assets, review artifacts, and preview output for the latest 12-slide example.

### Changed
- **Gemini role redefined**: From "quality reviewer" to "layout & aesthetic optimizer". Gemini now proposes concrete visual improvements, not just compliance checks.
- **Gemini intermediate artifacts preserved**: Raw Gemini outputs (`gemini-raw-*.md`) are kept in `${RUN_DIR}/reviews/` for traceability and debugging.
- **research-core agent**: Replaced `agent-reach` CLI dependency with probe-first flow — detects available tools at runtime and selects the best search method per platform.
- **README showcase**: Add GPT-5.4 OpenCode comparison entry and slide gallery references.
- **Documentation contracts synchronized**: Refresh `llmdoc/`, `README.md`, and `CLAUDE.md` to match the current workflow contracts for style registry discovery, `--run-id` resume behavior, `outline.json.approved`, batched `draft_slides_ready`, and delivery artifacts.
- **Review fallback docs corrected**: Update maintainer- and user-facing docs to reflect the real Gemini-unavailable behavior — technical validation only, with no fabricated aesthetic optimization loop.

### Removed
- **Legacy Xiaomi SU7 example bundles**: Remove archived `ppt-xiaomi-su7-2026`, `ppt-xiaomi-su7-launch`, and `ppt-xiaomi-su7-new-launch` assets.
