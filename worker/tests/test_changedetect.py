import hashlib

import pytest

from changedetect import (
    BASELINE,
    CHANGED,
    MAX_BLOCK_PAGE_CHARS,
    MAX_DIFF_CHARS,
    MIN_CONTENT_CHARS,
    STALE,
    UNCHANGED,
    classify_change,
    content_rejection_reason,
    parse_persist_response,
    pdf_fingerprint_text,
    sha256,
    summarize_diff,
)


class TestSha256:
    def test_matches_hashlib_reference(self):
        assert sha256("hello") == hashlib.sha256(b"hello").hexdigest()

    def test_is_deterministic(self):
        assert sha256("ReloGo") == sha256("ReloGo")

    def test_distinct_inputs_differ(self):
        assert sha256("a") != sha256("b")

    def test_empty_string_known_vector(self):
        assert sha256("") == (
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )

    def test_handles_unicode(self):
        # Government pages carry accented / French text; must hash without error.
        assert sha256("Régie de l'assurance maladie") == sha256(
            "Régie de l'assurance maladie"
        )
        assert len(sha256("é")) == 64


class TestPdfFingerprintText:
    def test_is_stable_and_passes_content_sanity_gate(self):
        content = b"%PDF-1.7\nexample"
        record = pdf_fingerprint_text(content)

        assert record == pdf_fingerprint_text(content)
        assert "Media type: application/pdf" in record
        assert f"Byte length: {len(content)}" in record
        assert content_rejection_reason(record) is None

    def test_binary_change_changes_monitoring_record(self):
        old = pdf_fingerprint_text(b"%PDF-1.7\nold")
        new = pdf_fingerprint_text(b"%PDF-1.7\nnew")

        assert old != new
        assert sha256(old) != sha256(new)


class TestClassifyChange:
    def test_no_prior_hash_is_baseline(self):
        assert classify_change(None, "abc") == BASELINE

    def test_identical_hash_is_unchanged(self):
        assert classify_change("abc", "abc") == UNCHANGED

    def test_different_hash_is_changed(self):
        assert classify_change("abc", "def") == CHANGED

    def test_none_baseline_takes_precedence(self):
        # A missing baseline must classify as BASELINE (never alert on first sight).
        assert classify_change(None, "") == BASELINE

    def test_empty_string_baseline_is_a_real_value(self):
        # An empty-string baseline is a recorded value, not "no baseline".
        assert classify_change("", "abc") == CHANGED
        assert classify_change("", "") == UNCHANGED

    @pytest.mark.parametrize(
        "last_hash,new_hash,expected",
        [
            (None, "x", BASELINE),
            ("x", "x", UNCHANGED),
            ("x", "y", CHANGED),
        ],
    )
    def test_table(self, last_hash, new_hash, expected):
        assert classify_change(last_hash, new_hash) == expected


def test_end_to_end_pipeline_detects_a_real_change():
    # Mirrors the worker loop: first scrape records a baseline (no alert); an
    # unchanged page next run stays quiet; a changed deadline fires an alert.
    old_content = "Licence exchange deadline: 90 days."
    new_content = "Licence exchange deadline: 60 days."
    old_hash = sha256(old_content)
    new_hash = sha256(new_content)

    assert classify_change(None, old_hash) == BASELINE       # first scrape
    assert classify_change(old_hash, old_hash) == UNCHANGED   # page unchanged
    assert classify_change(old_hash, new_hash) == CHANGED     # deadline changed → alert


class TestParsePersistResponse:
    @pytest.mark.parametrize(
        "classification,alert_id,current_hash",
        [
            (BASELINE, None, "a" * 64),
            (UNCHANGED, None, "b" * 64),
            (CHANGED, "40000000-0000-0000-0000-000000000001", "c" * 64),
            (STALE, None, "d" * 64),
            (STALE, None, None),
        ],
    )
    def test_valid_rpc_outcomes(self, classification, alert_id, current_hash):
        assert parse_persist_response(
            [
                {
                    "classification": classification,
                    "alert_id": alert_id,
                    "current_hash": current_hash,
                }
            ]
        ) == (classification, alert_id, current_hash)

    @pytest.mark.parametrize("data", [None, {}, [], [{}, {}]])
    def test_invalid_rpc_shapes_are_rejected(self, data):
        with pytest.raises(ValueError):
            parse_persist_response(data)

    def test_unknown_classification_is_rejected(self):
        with pytest.raises(ValueError, match="unknown classification"):
            parse_persist_response(
                [
                    {
                        "classification": "RACED",
                        "alert_id": None,
                        "current_hash": "a" * 64,
                    }
                ]
            )

    def test_changed_requires_alert_id(self):
        with pytest.raises(ValueError, match="missing its alert id"):
            parse_persist_response(
                [
                    {
                        "classification": CHANGED,
                        "alert_id": None,
                        "current_hash": "a" * 64,
                    }
                ]
            )

    def test_non_changed_must_not_include_alert_id(self):
        with pytest.raises(ValueError, match="included an alert id"):
            parse_persist_response(
                [
                    {
                        "classification": STALE,
                        "alert_id": "40000000-0000-0000-0000-000000000001",
                        "current_hash": "a" * 64,
                    }
                ]
            )

    def test_invalid_current_hash_is_rejected(self):
        with pytest.raises(ValueError, match="invalid current hash"):
            parse_persist_response(
                [
                    {
                        "classification": UNCHANGED,
                        "alert_id": None,
                        "current_hash": "not-a-hash",
                    }
                ]
            )


class TestSummarizeDiff:
    def test_no_baseline_text_returns_none(self):
        # Hash predates the last_content_text column — nothing to diff against.
        assert summarize_diff(None, "anything") is None

    def test_identical_text_returns_none(self):
        assert summarize_diff("same\ntext", "same\ntext") is None

    def test_line_change_appears_in_diff(self):
        old = "Deadline: 90 days.\nFee: $90."
        new = "Deadline: 60 days.\nFee: $90."
        diff = summarize_diff(old, new)
        assert diff is not None
        assert "-Deadline: 90 days." in diff
        assert "+Deadline: 60 days." in diff

    def test_diff_carries_file_labels(self):
        diff = summarize_diff("a", "b")
        assert diff is not None
        assert "previous scrape" in diff
        assert "current scrape" in diff

    def test_long_diff_is_truncated(self):
        old = "\n".join(f"old line {i}" for i in range(2000))
        new = "\n".join(f"new line {i}" for i in range(2000))
        diff = summarize_diff(old, new)
        assert diff is not None
        assert len(diff) <= MAX_DIFF_CHARS + len("\n… (diff truncated)")
        assert diff.endswith("… (diff truncated)")

    def test_custom_max_chars_respected(self):
        diff = summarize_diff("aaa\nbbb", "aaa\nccc", max_chars=10)
        assert diff is not None
        assert diff.endswith("… (diff truncated)")

    def test_whitespace_only_line_ending_churn_yields_none(self):
        # \r\n vs \n changes the hash but splitlines() normalises it away —
        # the alert still fires (hash differs) but there's no diff to show.
        assert summarize_diff("line one\r\nline two", "line one\nline two") is None


class TestContentRejectionReason:
    """Sanity gate: junk scrapes (blank renders, bot walls, error pages) must
    be rejected before they can poison the stored baseline or file a false
    alert."""

    @staticmethod
    def _interstitial(marker: str) -> str:
        # Pad past MIN_CONTENT_CHARS so the marker, not the length, rejects it.
        filler = "Please wait while we review the security of your request. " * 5
        return f"{marker}\n{filler}"

    def test_real_page_content_is_accepted(self):
        text = (
            "To exchange your driver's licence you must visit a registry "
            "agent within 90 days of arriving. Bring proof of residency "
            "and two pieces of identification. "
        ) * 5
        assert len(text) >= MIN_CONTENT_CHARS
        assert content_rejection_reason(text) is None

    def test_empty_body_is_rejected(self):
        reason = content_rejection_reason("")
        assert reason is not None
        assert "too short" in reason

    def test_whitespace_only_body_is_rejected(self):
        assert content_rejection_reason(" \n\t " * 200) is not None

    def test_short_body_is_rejected(self):
        assert content_rejection_reason("Loading…") is not None

    def test_min_chars_boundary(self):
        # Exactly the minimum passes; one char under fails.
        assert content_rejection_reason("a" * MIN_CONTENT_CHARS) is None
        assert content_rejection_reason("a" * (MIN_CONTENT_CHARS - 1)) is not None

    def test_min_chars_is_configurable(self):
        text = "Deadline: 90 days."
        assert content_rejection_reason(text, min_chars=10) is None
        assert content_rejection_reason(text, min_chars=100) is not None

    def test_max_chars_boundary(self):
        assert content_rejection_reason("a" * 20, min_chars=1, max_chars=20) is None
        reason = content_rejection_reason("a" * 21, min_chars=1, max_chars=20)
        assert reason is not None
        assert "too long" in reason

    def test_max_chars_checks_raw_text_before_stripping(self):
        reason = content_rejection_reason(" " * 21, min_chars=1, max_chars=20)
        assert reason is not None
        assert "too long" in reason

    @pytest.mark.parametrize(
        "interstitial",
        [
            "Access Denied",
            "Attention Required! | Cloudflare",
            "Checking your browser before accessing this site",
            "Please verify you are human to continue",
            "404 Not Found",
            "503 Service Unavailable",
            "This page is temporarily unavailable",
            "The site is down for maintenance",
        ],
    )
    def test_bot_block_and_error_interstitials_are_rejected(self, interstitial):
        reason = content_rejection_reason(self._interstitial(interstitial))
        assert reason is not None
        assert "bot-block/error page" in reason

    def test_marker_match_is_case_insensitive(self):
        assert content_rejection_reason(self._interstitial("ACCESS DENIED")) is not None

    def test_rejection_reason_names_the_marker(self):
        reason = content_rejection_reason(self._interstitial("Access Denied"))
        assert reason is not None
        assert "access denied" in reason

    def test_long_real_page_mentioning_a_marker_is_not_rejected(self):
        # A genuine content page may *mention* e.g. a captcha; only short
        # bodies (real interstitials) are scanned for block markers.
        text = (
            "Health card renewal steps and required documents explained. " * 100
            + "If the online form shows a captcha, call the office instead."
        )
        assert len(text) > MAX_BLOCK_PAGE_CHARS
        assert content_rejection_reason(text) is None
