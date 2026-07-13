"""Run-policy, reporting, and best-effort webhook helpers for the worker.

Keeping these helpers free of Playwright and Supabase makes the failure policy
and operator-facing messages straightforward to unit-test.
"""

from __future__ import annotations

import json
import urllib.request


def run_should_fail(stats: dict[str, int]) -> bool:
    """Return whether a completed run must exit non-zero.

    Every configured source is attempted before this policy is evaluated. A
    single failed source or stale compare-and-swap result is still an incomplete
    monitoring run and must be visible as a failed scheduled job. A zero-scrape
    run also fails, covering empty source sets and fatal setup errors.
    """

    return (
        stats["failed"] > 0
        or stats.get("stale", 0) > 0
        or stats["scraped"] == 0
    )


def build_notification_text(
    stats: dict[str, int],
    filed_alerts: list[dict],
    failed_sources: list[dict],
) -> str:
    """Build the Slack-compatible plain-text run notification."""

    outcome = "FAILED" if run_should_fail(stats) else "SUCCEEDED"
    lines = [
        f"ReloGo worker {outcome}: {stats['scraped']} source(s) scraped, "
        f"{stats['baseline']} baselined, {stats['unchanged']} unchanged, "
        f"{stats['changed']} changed, {stats['stale']} stale, "
        f"{stats['failed']} failed."
    ]

    if filed_alerts:
        lines.append(
            f"New PENDING rule-change alerts ({len(filed_alerts)}):"
        )
        for alert in filed_alerts:
            lines.append(
                f"• {alert['agency']}: {alert['url']} "
                f"(diff: {alert['diff_chars']} chars)"
            )
        lines.append("Review alerts in the admin dashboard before any rule update.")

    if stats["stale"] > 0:
        lines.append(
            f"Stale CAS outcomes ({stats['stale']}) wrote nothing; this run is "
            "incomplete and should be rerun against the current baseline."
        )

    if failed_sources:
        lines.append(f"Failures ({len(failed_sources)}):")
        for failure in failed_sources:
            lines.append(
                f"• {failure['agency']}: {failure['url']} — {failure['error']}"
            )
        lines.append("Inspect the GitHub Actions run for recovery details.")

    return "\n".join(lines)


def send_run_webhook(
    webhook_url: str,
    stats: dict[str, int],
    filed_alerts: list[dict],
    failed_sources: list[dict],
    opener=None,
) -> tuple[bool, str]:
    """Build and send one webhook without ever raising to the worker.

    Message rendering, JSON encoding, request construction, opening, and
    response handling all live inside the same best-effort boundary. ``opener``
    is injectable for focused tests; production uses ``urllib.request.urlopen``.
    """

    try:
        text = build_notification_text(stats, filed_alerts, failed_sources)
        payload = json.dumps({"text": text}).encode("utf-8")
        request = urllib.request.Request(
            webhook_url,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        open_request = opener or urllib.request.urlopen
        with open_request(request, timeout=10) as response:
            return True, f"HTTP {response.status}"
    except Exception as exc:  # noqa: BLE001
        # Return only the exception type so a malformed/secret webhook URL can
        # never be echoed into logs by the caller.
        return False, type(exc).__name__


def build_step_summary(
    stats: dict[str, int],
    filed_alerts: list[dict],
    failed_sources: list[dict],
) -> str:
    """Build the Markdown appended to ``GITHUB_STEP_SUMMARY``."""

    failed = run_should_fail(stats)
    lines = [
        "## ReloGo worker run",
        "",
        f"**Outcome:** {'❌ Incomplete' if failed else '✅ Complete'}",
        "",
        "| Scraped | Baselined | Unchanged | Changed | Stale | Failed |",
        "| ---: | ---: | ---: | ---: | ---: | ---: |",
        f"| {stats['scraped']} | {stats['baseline']} | {stats['unchanged']} "
        f"| {stats['changed']} | {stats['stale']} | {stats['failed']} |",
    ]

    if filed_alerts:
        lines += ["", "### New PENDING alerts", ""]
        for alert in filed_alerts:
            lines.append(
                f"- **{alert['agency']}** — {alert['url']} "
                f"(diff: {alert['diff_chars']} chars)"
            )

    if stats["stale"] > 0:
        lines += [
            "",
            "### Stale CAS outcomes",
            "",
            f"{stats['stale']} scrape(s) lost the compare-and-swap race and wrote "
            "nothing. This run exits non-zero so the source can be rerun against "
            "its current baseline.",
        ]

    if failed_sources:
        lines += ["", "### Failures", ""]
        for failure in failed_sources:
            lines.append(
                f"- **{failure['agency']}** — {failure['url']} — "
                f"{failure['error']}"
            )
        lines.append("")
        if any(failure.get("kind") == "runtime" for failure in failed_sources):
            lines.append(
                "The run stopped during setup/runtime and exits non-zero; inspect "
                "the Actions log before relying on monitoring coverage."
            )
        else:
            lines.append(
                "All configured sources were attempted. Failed sources kept their "
                "last known-good baseline, and this run exits non-zero."
            )

    return "\n".join(lines) + "\n"
