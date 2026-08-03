import asyncio
import urllib.error

import pytest

import main as worker


def _source(source_id: str, url: str, agency: str = "Agency") -> dict:
    return {
        "id": source_id,
        "agency_name": agency,
        "official_url": url,
        "last_content_hash": None,
        "last_content_text": None,
    }


def test_scrape_origin_normalizes_host_case_and_default_port():
    assert worker.scrape_origin("HTTPS://Example.GOV:443/a") == "https://example.gov"
    assert worker.scrape_origin("https://example.gov/b") == "https://example.gov"
    assert worker.scrape_origin("https://example.gov:8443/b") == (
        "https://example.gov:8443"
    )
    assert worker.scrape_origin("not-a-url") == "invalid:not-a-url"


def test_origin_gate_applies_spacing_and_bounds_injected_jitter():
    now = [100.0]
    sleeps = []

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)
        now[0] += delay

    async def exercise() -> None:
        gate = worker.OriginRequestGate(
            1.0,
            0.25,
            clock=lambda: now[0],
            sleep=fake_sleep,
            # An out-of-contract source cannot expand the configured bound.
            jitter=lambda _minimum, _maximum: 99.0,
        )
        async with gate.request_slot():
            pass
        async with gate.request_slot():
            pass

    asyncio.run(exercise())

    assert sleeps == [1.25]


def test_missing_url_fails_before_request_gate():
    class GateThatMustNotBeUsed:
        def request_slot(self):
            raise AssertionError("missing URL must bypass the origin gate")

    async def exercise():
        return await worker.scrape_source(
            None,
            _source("1", ""),
            asyncio.Semaphore(1),
            GateThatMustNotBeUsed(),
        )

    outcome = asyncio.run(exercise())

    assert outcome.body_text is None
    assert outcome.error == "official source URL is missing"
    assert outcome.failure_category == "configuration"


def test_managed_challenge_header_gets_distinct_non_retryable_error():
    class Response:
        status = 403

        async def all_headers(self):
            return {"cf-mitigated": "challenge"}

    class Page:
        async def goto(self, *_args, **_kwargs):
            return Response()

    with pytest.raises(worker.ManagedChallengeError, match="managed anti-bot"):
        asyncio.run(worker._scrape_with_retry(Page(), "https://example.gov/page"))


def test_pdf_managed_challenge_header_gets_distinct_error(monkeypatch):
    error = urllib.error.HTTPError(
        "https://example.gov/form.pdf",
        403,
        "Forbidden",
        {"cf-mitigated": "challenge"},
        None,
    )

    def fake_urlopen(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(worker.urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(worker.ManagedChallengeError, match="managed anti-bot"):
        worker._scrape_pdf_with_retry("https://example.gov/form.pdf")


@pytest.mark.parametrize(
    "interstitial",
    [
        "CAPTCHA",
        "Verifying your browser before proceeding",
        "Checking your browser before accessing this site",
        "Please verify you are human to continue",
    ],
)
def test_captcha_body_gets_distinct_category_and_no_content(
    monkeypatch, interstitial
):
    async def fake_scrape_html(_context, _url):
        return interstitial

    monkeypatch.setattr(worker, "scrape_html_url", fake_scrape_html)

    async def exercise():
        return await worker.scrape_source(
            None,
            _source("1", "https://example.gov/page"),
            asyncio.Semaphore(1),
            worker.OriginRequestGate(0, 0),
        )

    outcome = asyncio.run(exercise())

    assert outcome.body_text is None
    assert outcome.failure_category == "captcha"
    assert outcome.error == "CAPTCHA challenge returned instead of source content"


@pytest.mark.parametrize(
    "interstitial",
    [
        "Verifying your browser before proceeding",
        "Checking your browser before accessing this site",
        "Please enable JavaScript and cookies to continue",
    ],
)
def test_long_high_confidence_challenge_never_becomes_baseline(
    monkeypatch, interstitial
):
    async def fake_scrape_html(_context, _url):
        return "Security request in progress. " * 150 + interstitial

    monkeypatch.setattr(worker, "scrape_html_url", fake_scrape_html)

    async def exercise():
        return await worker.scrape_source(
            None,
            _source("1", "https://example.gov/page"),
            asyncio.Semaphore(1),
            worker.OriginRequestGate(0, 0),
        )

    outcome = asyncio.run(exercise())

    assert outcome.body_text is None
    assert outcome.failure_category == "captcha"


def test_duplicate_url_is_fetched_once_and_failure_fans_out(monkeypatch):
    calls = []

    async def fake_scrape_source(_context, source, _semaphore, _origin_gate):
        calls.append(source["id"])
        return worker.ScrapeOutcome(
            source=source,
            error="HTTP 403 managed anti-bot challenge",
            failure_category="managed_challenge",
        )

    monkeypatch.setattr(worker, "scrape_source", fake_scrape_source)

    shared_url = "https://example.gov/shared"
    sources = [
        _source("1", shared_url, "Agency one"),
        _source("2", shared_url, "Agency two"),
    ]
    outcomes = asyncio.run(worker.scrape_all_sources(None, sources))

    assert calls == ["1"]
    assert [outcome.source["id"] for outcome in outcomes] == ["1", "2"]
    assert all(outcome.failure_category == "managed_challenge" for outcome in outcomes)

    stats = {
        "scraped": 0,
        "baseline": 0,
        "unchanged": 0,
        "changed": 0,
        "stale": 0,
        "failed": 0,
    }
    failures = []
    worker.persist_outcomes(object(), outcomes, stats, [], failures)

    assert stats["failed"] == 2
    assert [failure["agency"] for failure in failures] == [
        "Agency one",
        "Agency two",
    ]
    assert all(failure["category"] == "managed_challenge" for failure in failures)


def test_duplicate_url_success_persists_each_source_row(monkeypatch):
    scrape_calls = []
    persist_calls = []

    async def fake_scrape_source(_context, source, _semaphore, _origin_gate):
        scrape_calls.append(source["id"])
        return worker.ScrapeOutcome(
            source=source,
            body_text="Official government source content. " * 20,
        )

    def fake_persist(
        _sb, source_id, expected_hash, new_hash, _body_text, _diff_summary
    ):
        persist_calls.append((source_id, expected_hash))
        return worker.UNCHANGED, None, new_hash

    monkeypatch.setattr(worker, "scrape_source", fake_scrape_source)
    monkeypatch.setattr(worker, "persist_scrape_result", fake_persist)

    shared_url = "https://example.gov/shared"
    first = _source("1", shared_url, "Agency one")
    first["last_content_hash"] = "a" * 64
    second = _source("2", shared_url, "Agency two")
    second["last_content_hash"] = "b" * 64
    outcomes = asyncio.run(worker.scrape_all_sources(None, [first, second]))
    stats = {
        "scraped": 0,
        "baseline": 0,
        "unchanged": 0,
        "changed": 0,
        "stale": 0,
        "failed": 0,
    }

    worker.persist_outcomes(object(), outcomes, stats, [], [])

    assert scrape_calls == ["1"]
    assert persist_calls == [("1", "a" * 64), ("2", "b" * 64)]
    assert stats["scraped"] == 2
    assert stats["unchanged"] == 2
    assert stats["failed"] == 0


def test_same_origin_requests_are_serialized(monkeypatch):
    active = 0
    maximum_active = 0

    async def fake_scrape_html(_context, _url):
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.01)
        active -= 1
        return "Official government source content. " * 20

    monkeypatch.setattr(worker, "scrape_html_url", fake_scrape_html)
    monkeypatch.setattr(worker, "ORIGIN_MIN_SPACING_SECONDS", 0)
    monkeypatch.setattr(worker, "ORIGIN_MAX_JITTER_SECONDS", 0)

    sources = [
        _source("1", "https://example.gov/one"),
        _source("2", "https://example.gov/two"),
    ]
    outcomes = asyncio.run(worker.scrape_all_sources(None, sources))

    assert maximum_active == 1
    assert all(outcome.error is None for outcome in outcomes)


def test_different_origins_still_run_concurrently(monkeypatch):
    async def exercise():
        both_started = asyncio.Event()
        started = []

        async def fake_scrape_html(_context, url):
            started.append(url)
            if len(started) == 2:
                both_started.set()
            await asyncio.wait_for(both_started.wait(), timeout=0.2)
            return "Official government source content. " * 20

        monkeypatch.setattr(worker, "scrape_html_url", fake_scrape_html)
        sources = [
            _source("1", "https://one.example.gov/page"),
            _source("2", "https://two.example.gov/page"),
        ]
        outcomes = await worker.scrape_all_sources(None, sources)
        return started, outcomes

    monkeypatch.setattr(worker, "ORIGIN_MIN_SPACING_SECONDS", 0)
    monkeypatch.setattr(worker, "ORIGIN_MAX_JITTER_SECONDS", 0)
    started, outcomes = asyncio.run(exercise())

    assert len(started) == 2
    assert all(outcome.error is None for outcome in outcomes)


def test_global_concurrency_cap_applies_across_origins(monkeypatch):
    active = 0
    maximum_active = 0

    async def fake_scrape_html(_context, _url):
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.01)
        active -= 1
        return "Official government source content. " * 20

    monkeypatch.setattr(worker, "scrape_html_url", fake_scrape_html)
    monkeypatch.setattr(worker, "SCRAPE_CONCURRENCY", 2)
    monkeypatch.setattr(worker, "ORIGIN_MIN_SPACING_SECONDS", 0)
    monkeypatch.setattr(worker, "ORIGIN_MAX_JITTER_SECONDS", 0)
    sources = [
        _source(str(index), f"https://origin-{index}.example.gov/page")
        for index in range(5)
    ]

    outcomes = asyncio.run(worker.scrape_all_sources(None, sources))

    assert maximum_active == 2
    assert all(outcome.error is None for outcome in outcomes)


def test_unexpected_task_failure_cancels_and_awaits_siblings(monkeypatch):
    both_started = asyncio.Event()
    sibling_cancelled = asyncio.Event()
    started = 0

    async def fake_scrape_source(_context, source, _semaphore, _origin_gate):
        nonlocal started
        started += 1
        if started == 2:
            both_started.set()
        await both_started.wait()
        if source["id"] == "1":
            raise RuntimeError("unexpected task failure")
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            sibling_cancelled.set()
            raise

    monkeypatch.setattr(worker, "scrape_source", fake_scrape_source)
    sources = [
        _source("1", "https://one.example.gov/page"),
        _source("2", "https://two.example.gov/page"),
    ]

    async def exercise():
        with pytest.raises(RuntimeError, match="unexpected task failure"):
            await worker.scrape_all_sources(None, sources)
        assert sibling_cancelled.is_set()

    asyncio.run(exercise())
