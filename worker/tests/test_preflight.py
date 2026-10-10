from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

import preflight
from preflight import is_expected_production_url


@pytest.mark.parametrize(
    "value",
    [
        "https://yskknolxbxfxakgvrcmg.supabase.co",
        "https://yskknolxbxfxakgvrcmg.supabase.co/",
    ],
)
def test_production_url_accepts_only_the_expected_origin(value):
    assert is_expected_production_url(value) is True


@pytest.mark.parametrize(
    "value",
    [
        "https://uwfblgllkibbupqyofkl.supabase.co",
        "http://yskknolxbxfxakgvrcmg.supabase.co",
        "https://yskknolxbxfxakgvrcmg.supabase.co.attacker.example",
        "https://yskknolxbxfxakgvrcmg.supabase.co/rest/v1",
        "https://user@yskknolxbxfxakgvrcmg.supabase.co",
        "not-a-url",
    ],
)
def test_production_url_rejects_preview_and_lookalikes(value):
    assert is_expected_production_url(value) is False


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://yskknolxbxfxakgvrcmg.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key")
    client = MagicMock()
    monkeypatch.setattr(preflight, "create_client", lambda *args: client)
    return client


def test_missing_monitoring_schema_stops_before_resolver_and_explains_rollout(
    client, capsys
):
    query = client.table.return_value.select.return_value.limit.return_value
    query.execute.side_effect = [
        SimpleNamespace(count=53),
        RuntimeError("42703: private database detail with test-only-key"),
    ]

    assert preflight.main() == 1
    error = capsys.readouterr().err
    assert "027_worker_source_monitoring.sql" in error
    assert "no baselines were written" in error
    assert "test-only-key" not in error
    assert "private database detail" not in error
    client.rpc.assert_not_called()
    # Only a basic access probe and the required new metadata probe are allowed;
    # no fallback may silently drop MANUAL sources or their private target URL.
    assert client.table.return_value.select.call_count == 2


def test_preflight_distinguishes_key_failure_from_missing_monitoring_schema(
    client, capsys
):
    query = client.table.return_value.select.return_value.limit.return_value
    query.execute.side_effect = RuntimeError("invalid test-only-key")

    assert preflight.main() == 1
    error = capsys.readouterr().err
    assert "cannot authenticate" in error
    assert "migration 027" not in error
    assert "test-only-key" not in error
    client.rpc.assert_not_called()


def test_preflight_checks_monitoring_columns_and_resolver_before_success(
    client, capsys
):
    query = client.table.return_value.select.return_value.limit.return_value
    query.execute.return_value = SimpleNamespace(count=53)

    assert preflight.main() == 0
    assert "53 sources" in capsys.readouterr().out
    columns = client.table.return_value.select.call_args_list[1].args[0]
    assert all(column in columns for column in (
        "monitor_url", "monitoring_mode", "manual_review_owner",
        "manual_review_interval_days",
    ))
    client.rpc.assert_called_once_with(
        "resolve_corridor_rules",
        {"p_origin_province": "ON", "p_dest_province": "BC"},
    )


def test_preflight_sanitizes_resolver_failure(client, capsys):
    query = client.table.return_value.select.return_value.limit.return_value
    query.execute.return_value = SimpleNamespace(count=53)
    client.rpc.return_value.execute.side_effect = RuntimeError(
        "private resolver detail"
    )

    assert preflight.main() == 1
    error = capsys.readouterr().err
    assert "canonical corridor resolver" in error
    assert "private resolver detail" not in error
