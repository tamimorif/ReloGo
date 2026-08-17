import json

from reporting import (
    build_notification_text,
    build_step_summary,
    run_should_fail,
    send_run_webhook,
)


def _stats(**overrides):
    stats = {
        "scraped": 3,
        "baseline": 0,
        "unchanged": 2,
        "changed": 1,
        "stale": 0,
        "failed": 0,
        "manual": 0,
    }
    stats.update(overrides)
    return stats


class TestRunShouldFail:
    def test_complete_run_succeeds(self):
        assert run_should_fail(_stats()) is False

    def test_partial_failure_fails(self):
        assert run_should_fail(_stats(scraped=2, failed=1)) is True

    def test_all_failed_fails(self):
        assert run_should_fail(_stats(scraped=0, unchanged=0, changed=0, failed=3))

    def test_empty_source_set_fails(self):
        assert run_should_fail(_stats(scraped=0, unchanged=0, changed=0, failed=0))

    def test_stale_cas_outcome_fails_even_without_source_error(self):
        assert run_should_fail(_stats(stale=1, failed=0)) is True


def test_notification_reports_alerts_and_failures():
    text = build_notification_text(
        _stats(scraped=2, failed=1),
        [
            {
                "agency": "Province A",
                "url": "https://example.gov/a",
                "diff_chars": 120,
            }
        ],
        [
            {
                "agency": "Province B",
                "url": "https://example.gov/b",
                "error": "HTTP 503",
                "kind": "source",
            }
        ],
        [],
    )

    assert "FAILED" in text
    assert "New PENDING rule-change alerts (1)" in text
    assert "Province A" in text
    assert "Failures (1)" in text
    assert "Province B" in text
    assert "HTTP 503" in text


def test_success_notification_has_no_failure_section():
    text = build_notification_text(_stats(), [], [], [])

    assert "SUCCEEDED" in text
    assert "Failures" not in text


def test_reporting_distinguishes_managed_and_captcha_challenges():
    failures = [
        {
            "agency": "Managed",
            "url": "https://managed.example/page",
            "error": "HTTP 403 managed anti-bot challenge",
            "kind": "source",
            "category": "managed_challenge",
        },
        {
            "agency": "Captcha",
            "url": "https://captcha.example/page",
            "error": "CAPTCHA challenge returned instead of source content",
            "kind": "source",
            "category": "captcha",
        },
    ]

    text = build_notification_text(
        _stats(scraped=1, failed=2), [], failures, []
    )
    summary = build_step_summary(
        _stats(scraped=1, failed=2), [], failures, []
    )

    assert "1 managed anti-bot, 1 CAPTCHA" in text
    assert "still failed closed" in text
    assert "### Access challenges" in summary
    assert "Managed anti-bot challenges: **1**" in summary
    assert "CAPTCHA challenges: **1**" in summary
    assert "did not replace any last-known-good baseline" in summary


def test_stale_notification_explains_incomplete_no_write_outcome():
    text = build_notification_text(_stats(stale=1), [], [], [])

    assert "FAILED" in text
    assert "Stale CAS outcomes (1) wrote nothing" in text
    assert "rerun against the current baseline" in text


def test_step_summary_explains_partial_failure_policy():
    summary = build_step_summary(
        _stats(scraped=2, failed=1),
        [],
        [
            {
                "agency": "Province B",
                "url": "https://example.gov/b",
                "error": "timed out",
                "kind": "source",
            }
        ],
        [],
    )

    assert "Automatic checks incomplete" in summary
    assert "### Failures" in summary
    assert "All automatic sources were attempted" in summary
    assert "exits non-zero" in summary


def test_step_summary_explains_stale_cas_is_incomplete():
    summary = build_step_summary(_stats(stale=1, failed=0), [], [], [])

    assert "Automatic checks incomplete" in summary
    assert "### Stale CAS outcomes" in summary
    assert "wrote nothing" in summary
    assert "exits non-zero" in summary


def test_step_summary_does_not_claim_sources_were_attempted_on_setup_failure():
    summary = build_step_summary(
        _stats(scraped=0, unchanged=0, changed=0, failed=1),
        [],
        [
            {
                "agency": "Worker runtime",
                "url": "n/a",
                "error": "missing configuration",
                "kind": "runtime",
            }
        ],
        [],
    )

    assert "stopped during setup/runtime" in summary
    assert "All automatic sources were attempted" not in summary


def test_manual_assignments_stay_visible_without_failing_healthy_automation():
    manual_sources = [
        {
            "agency": "Government of Yukon",
            "url": "https://yukon.ca/example",
            "owner": "ReloGo operations",
            "interval_days": 30,
        }
    ]
    stats = _stats(manual=1)

    assert run_should_fail(stats) is False
    text = build_notification_text(stats, [], [], manual_sources)
    summary = build_step_summary(stats, [], [], manual_sources)

    assert "1 manual" in text
    assert "not automatic coverage" in text
    assert "Manual monitoring assignments" in summary
    assert "Automatic checks complete" in summary
    assert "ReloGo operations" in summary
    assert "interval is an assignment, not proof" in summary


class TestSendRunWebhook:
    class Response:
        status = 204

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def test_success_builds_slack_compatible_json(self):
        captured = {}

        def opener(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return self.Response()

        sent, detail = send_run_webhook(
            "https://hooks.example.test/services/redacted",
            _stats(stale=1),
            [],
            [],
            [],
            opener=opener,
        )

        assert sent is True
        assert detail == "HTTP 204"
        assert captured["timeout"] == 10
        payload = json.loads(captured["request"].data.decode("utf-8"))
        assert "text" in payload
        assert "1 stale" in payload["text"]

    def test_message_construction_failure_is_swallowed(self):
        sent, detail = send_run_webhook(
            "https://hooks.example.test/services/redacted",
            _stats(),
            [{}],
            [],
            [],
            opener=lambda *_args, **_kwargs: self.Response(),
        )

        assert sent is False
        assert detail == "KeyError"

    def test_network_failure_is_swallowed_without_secret_detail(self):
        def opener(_request, timeout):
            assert timeout == 10
            raise RuntimeError("https://secret-webhook.example/token")

        sent, detail = send_run_webhook(
            "https://hooks.example.test/services/redacted",
            _stats(),
            [],
            [{"agency": "A", "url": "https://gov/a", "error": "timeout"}],
            [],
            opener=opener,
        )

        assert sent is False
        assert detail == "RuntimeError"
        assert "secret-webhook" not in detail
