import pytest

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
