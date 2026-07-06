import hashlib

import pytest

from changedetect import BASELINE, CHANGED, UNCHANGED, classify_change, sha256


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
