"""Every origin -> destination corridor must produce a usable checklist.

The app ships a picker with all 13 provinces and territories on both sides, so
every one of the 156 selectable corridors is a real user journey. A corridor
that returns nothing is a dead end for that user, and a corridor that returns
another jurisdiction's rules is wrong content -- neither is caught by testing a
single hand-picked pair.

These cases mirror the query in mobile/app/(tabs)/checklist.tsx exactly:

    .from("corridor_task_rules")
    .select("*, global_tasks(*)")
    .or(origin_province.eq.<O>,origin_province.eq.ANY)
    .or(dest_province.eq.<D>,dest_province.eq.ANY)

followed by the client-side requires_vehicle / requires_dependents filter.
"""
import pytest

PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU",
             "ON", "PE", "QC", "SK", "YT"]

# Real corridors only. Onboarding rejects same-province moves with a
# "Same jurisdiction" alert, so the diagonal is not reachable by a user.
CORRIDORS = [(o, d) for o in PROVINCES for d in PROVINCES if o != d]


def _rules_for(client, origin, dest):
    return (
        client.table("corridor_task_rules")
        .select("*, global_tasks(*)")
        .or_(f"origin_province.eq.{origin},origin_province.eq.ANY")
        .or_(f"dest_province.eq.{dest},dest_province.eq.ANY")
        .execute()
        .data
    )


def _visible(rules, has_vehicle, has_dependents):
    return [
        r for r in rules
        if not (r["global_tasks"]["requires_vehicle"] and not has_vehicle)
        and not (r["global_tasks"]["requires_dependents"] and not has_dependents)
    ]


@pytest.mark.parametrize("origin,dest", CORRIDORS,
                         ids=[f"{o}-{d}" for o, d in CORRIDORS])
def test_every_corridor_yields_a_usable_checklist(anon_client, origin, dest):
    rules = _rules_for(anon_client, origin, dest)

    # A user who brings nothing still gets the universally applicable tasks.
    assert _visible(rules, False, False), (
        f"{origin}->{dest} produced an empty checklist for a user with no "
        f"vehicle and no dependents"
    )
    # Declaring a vehicle and dependents may only ever add tasks.
    minimal = len(_visible(rules, False, False))
    maximal = len(_visible(rules, True, True))
    assert maximal >= minimal

    for rule in rules:
        assert rule["origin_province"] in (origin, "ANY"), (
            f"{origin}->{dest} returned a rule scoped to origin "
            f"{rule['origin_province']}"
        )
        assert rule["dest_province"] in (dest, "ANY"), (
            f"{origin}->{dest} returned a rule scoped to destination "
            f"{rule['dest_province']}"
        )
        assert rule["global_tasks"] is not None, (
            f"{origin}->{dest} returned a corridor rule with no parent task"
        )


def test_destinations_are_actually_differentiated(anon_client):
    """Guard against every destination collapsing to identical content.

    All seeded rules currently use an 'ANY' origin, so origin genuinely does
    not change the result yet -- that is a known content gap, not a bug. What
    must hold is that destinations differ: if a schema or seed change ever made
    every province return the same deadlines, the product would silently stop
    being a per-jurisdiction checklist while every other test still passed.
    """
    deadlines_by_dest = {}
    for dest in PROVINCES:
        rules = _rules_for(anon_client, "AB" if dest != "AB" else "BC", dest)
        deadlines_by_dest[dest] = sorted(
            (r["global_tasks"]["task_key"], r["days_deadline"]) for r in rules
        )

    distinct = {tuple(v) for v in deadlines_by_dest.values()}
    assert len(distinct) > 1, (
        "every destination returned identical deadlines; per-jurisdiction "
        "content has been lost"
    )

    # Spot-check the two destinations whose statutory deadlines differ most,
    # both verified against their official sources during the content audit.
    ontario = dict((k, v) for k, v in deadlines_by_dest["ON"])
    assert ontario["EXCHANGE_DRIVERS_LICENCE"] == 60
    assert ontario["REGISTER_VEHICLE"] == 30

    quebec = dict((k, v) for k, v in deadlines_by_dest["QC"])
    assert quebec["EXCHANGE_DRIVERS_LICENCE"] is None
    assert quebec["REGISTER_VEHICLE"] is None
