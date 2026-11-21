# ReloGo iPhone simulator QA runbook

_Updated November 19, 2026 · Current simplified mobile app · Local development_

Run this guide as a tester and return the report in section 6. It covers the
move form, checklist, local storage, human support, Admin replies, recovery,
and accessibility. Simulator results apply to the tested checkout and launch
mode. TestFlight, store signing, Android, and physical-device behavior require
separate runs.

## 1. Prepare the run

1. From the ReloGo repository root, read [AGENTS.md](../../AGENTS.md) and
   [AI_HANDOFF.md](AI_HANDOFF.md). Record the branch, commit, and whether the
   tree has local changes. Preserve the tester's checkout. Report defects
   without editing the app, database schema, or configuration to make a case pass.
2. Use a dedicated iPhone simulator with synthetic data. Record the iPhone model,
   iOS and Xcode versions, and whether you launch through Expo Go or an installed
   development build. Prefer iPhone 17 if available. If the existing device has
   a real checklist or earlier test state to preserve, use another simulator.
3. Use local Supabase and local Admin throughout. Keep credentials, API keys,
   tokens, and unrelated records out of evidence. Do not link, push, or use
   hosted Supabase, and do not reset the database or erase a simulator as a
   routine setup step. Run the checklist reset case only on your own disposable
   fixture. A human tester handles the agreement step if the agent's tools
   require a handoff.

From the repository root, check the prerequisites:

```sh
git status --short --branch
git rev-parse --short HEAD
node --version
python3.11 --version
xcodebuild -version
xcrun simctl list devices available
```

Use Node 22, Python 3.11, Docker, the repository's Supabase CLI, and an installed
iOS simulator runtime. If dependencies are missing, run `npm ci` in `mobile/`
and, for Admin cases, in `admin/`. Boot the chosen iPhone in Simulator or Xcode
Device Hub. Check that the phone you interact with is the device Metro opens.

**Terminal A — local backend.** Start Docker if needed. Start local Supabase if
it is not running, then check the local REST endpoint. Record the migration
ledger with `supabase migration list --local` if fixture behavior differs or
the ledger is needed for the report. Keep status output private because it
may include credentials.

```sh
supabase start
curl --fail --silent --show-error --max-time 5 -o /dev/null \
  -w 'Local REST HTTP %{http_code}\n' http://127.0.0.1:54321/rest/v1/
```

**Terminal B — mobile.** Keep Metro running throughout the test.

```sh
python3.11 scripts/run-local-app.py mobile -- --ios --clear
```

Confirm the launcher prints a loopback Supabase origin and Metro identifies
the intended iPhone. The launcher injects local settings into the app process.
`--clear` clears Metro's cache only. Open the ReloGo project from that Metro
session. An installed ReloGo icon and the ReloGo project in Expo Go may use
different storage and configuration. Keep the same launch mode for persistence
checks. If Metro's port is busy, identify its owner or pass `--port 8082` to
this launcher and use the URL it prints.

**Terminal C — Admin.** Start Admin against the same local backend.

```sh
python3.11 scripts/run-local-app.py admin
```

Open the local address printed by Vite. Use a disposable local admin account.
If one is unavailable, an authorized local operator can make a confirmed test
user in local Supabase Studio (**Authentication → Users**) and grant that
specific synthetic UUID membership in the local SQL Editor:

```sql
insert into public.admin_users (user_id)
values ('PASTE-LOCAL-TEST-USER-UUID'::uuid)
on conflict (user_id) do nothing;
```

Confirm you can open **Messages**. If Admin is unavailable, complete the mobile
cases and mark the Admin-dependent assertions **BLOCKED**. Leave pre-existing
users and threads alone.

## 2. Fixtures and evidence

| Fixture | Value |
| --- | --- |
| Route A | Toronto, Ontario → Vancouver, British Columbia |
| Route B | Toronto, Ontario → Calgary, Alberta |
| Initial answers | Both **Skip for now** |
| Reply marker | `ReloGo QA reply <run-id>`, with a unique timestamp or initials |
| Device | Same simulator and same launch mode through relaunch and reset |

Use the actual local task titles in evidence. The earlier local ON → BC probe
returned five rules. Confirm the current fixture before assuming a count.
Identify one vehicle-related task, one school-related task, and one
unconditional task from Route A before testing filters.

Keep screenshots outside the checkout. Use the actual simulator UUID to
avoid capturing another device. Review artifacts for secrets and unrelated data
before sharing them.

```sh
mkdir -p /tmp/relogo-simulator-evidence
xcrun simctl io '<SIMULATOR-UUID>' screenshot \
  /tmp/relogo-simulator-evidence/SIM-01-onboarding.png
```

## 3. Checklist cases

### SIM-01 — Launch and inspect onboarding

1. Open the project. Verify the screen header says **ReloGo** and the route
   form is visible. If the device legitimately has a saved move, use a fresh
   test simulator for this case.
2. Check for origin and destination city and province or territory controls.
   Open each picker, confirm it can scroll, and select an entry.
3. Find both optional questions, the policy links, the agreement checkbox,
   and **Build My Checklist**. Both questions should default to **Skip for now**.

**Expected:** The form collects only the route, two optional answers, and
agreement. Name, email, street address, move date, vehicle or child count,
account setup, map, PDF filling, and AI are outside this version's flow.

### SIM-02 — Validate incomplete and invalid input

1. Tap **Build My Checklist** with the form empty. Expect a missing origin
   alert. Select Ontario as origin and retry with no destination. Expect a
   missing destination alert.
2. Select British Columbia as destination and leave a city blank or spaces
   only. Expect **Missing city**. Enter both cities.
3. Set destination province to Ontario and retry. Expect **Same jurisdiction**.
4. Restore British Columbia and leave the agreement unchecked. Expect
   **Consent Required**. Dismiss each alert before continuing.

**Expected:** Each attempt stays on onboarding and explains the issue.
Record all five invalid attempts separately.

### SIM-03 — Build and inspect Route A

1. Set Route A and leave both answers at **Skip for now**. Have the human tester
   accept the agreement when needed, then submit. If the handoff is pending,
   keep the form open so it can be submitted in the same session.
2. Check the route header, task cards, and progress. Note the visible count and
   the vehicle and school tasks with their conditional labels.
3. Tap a task title or its details area. Check that it expands without toggling
   completion. Check its description, timing guidance, and official source
   section. For a task with a link, tap one official source, confirm the intended
   HTTPS government page opens, and return to ReloGo. Record external site
   availability separately from whether the app opened the intended URL.

**Expected:** The route matches the form, the checklist is usable, and initial
progress is zero on a fresh fixture. Capture the header and one expanded card.

### SIM-04 — Test all nine preference combinations

Mark an unconditional task complete on Route A. For each row, open **Move**,
select the two answers, tap **Save move details**, dismiss **Saved on this
device**, and return to **Checklist**. Record one outcome per row. The
unconditional checkmark should stay checked. If a conditional task is absent
from the local resolver fixture itself, mark the affected assertions blocked.

| Row | Vehicle | Children | Vehicle task | School task |
| --- | --- | --- | --- | --- |
| 1 | Yes | Yes | Visible, no conditional label | Visible, no conditional label |
| 2 | Yes | No | Visible, no conditional label | Hidden |
| 3 | Yes | Skip | Visible, no conditional label | Visible with label |
| 4 | No | Yes | Hidden | Visible, no conditional label |
| 5 | No | No | Hidden | Hidden |
| 6 | No | Skip | Hidden | Visible with label |
| 7 | Skip | Yes | Visible with label | Visible, no conditional label |
| 8 | Skip | No | Visible with label | Hidden |
| 9 | Skip | Skip | Visible with label | Visible with label |

Also check a conditional task, hide it by answering **No**, then restore it
with **Yes**. Expect its earlier checkmark to return. Undo that extra checkmark
before the next case and restore both answers to **Skip for now**.

### SIM-05 — Toggle progress and relaunch

1. Tap a task's round checkbox. Verify the count and percentage update, and the
   completed task moves below unfinished tasks. Undo and confirm the count
   decreases. On disposable data, complete all visible tasks and confirm 100%,
   then undo until one known task remains complete.
2. Background and reopen the app. Then close the app or Expo Go from the iOS
   app switcher and reopen the same project through the same launch mode.
   Keep Metro running. Going to the home screen alone does not count as closing.
3. Verify the route, saved answers, and known checkmark. Pull to refresh and
   verify the checkmark again.

**Expected:** The saved move and checkmark survive a process restart and
refresh. Capture matching before and after screenshots.

### SIM-06 — Edit the move and isolate checkmarks by route

1. In **Move**, try saving a blank city and then matching provinces. Verify
   each is rejected and the saved checklist is intact.
2. Edit only the destination city on Route A without changing the provinces.
   Save and check that the displayed city changes while the checkmark remains.
   Restore Vancouver.
3. Save Route B and verify the checklist updates and starts with no completion
   from Route A. Mark one task complete on Route B. Switch to Route A and then
   back to Route B. Each route should restore its own checkmark. End on Route A.

**Expected:** Cities change the displayed route. The ordered province pair
determines the task guidance and the saved progress.

## 4. Human support, reset, and accessibility

### SIM-07 — Start a support thread

1. Open **Move → Human support**. On a clean support identity, expect
   **How can we help?** and six prepared questions under **Choose a question**.
   Verify that the mobile screen has no free-text composer.
2. Tap **What should I do first for my move?** once. Wait for the message and
   the banner indicating the support team will reply. Record the send time.
3. Tap the Help back button and verify it returns to Move. Open Help again and
   verify that the same message appears once.

**Expected:** The chosen question appears in an awaiting-human thread. The
app sends no automated reply for the new message.

### SIM-08 — Verify chat persistence

Close the same app process and relaunch as in SIM-05. Reopen **Human support**.
The original thread and question should reappear once. Repeat after SIM-09 to
verify that the human reply also survives relaunch. Online persistence alone
does not establish that the on-device cache works offline.

### SIM-09 — Reply from Admin and verify live delivery

1. In local Admin **Messages**, identify the thread by send time and exact
   question. Open it and confirm **Awaiting human**. Record a redacted thread
   identifier for comparison with SIM-10.
2. Keep Help open in the simulator. In Admin, click **Take over** and verify
   **Human** status. Send the fixture reply marker using **Send**.
3. Watch the simulator without changing tabs or refreshing. Record whether
   the reply appears once under **Support**, and how long it took. If it only
   appears after leaving and reopening Help, record live delivery as **FAIL**
   and transcript retrieval separately.

**Expected:** The same thread contains the user question and the Admin reply
on both screens.

### SIM-10 — Resolve and start a separate chat

1. In the same Admin thread, click **Mark resolved**. On mobile, expect
   **This conversation is closed.** and **New chat**. Verify the old transcript
   is visible and the question buttons cannot send in that thread.
2. Tap **New chat**, then **Which documents should I prepare?**. Check that
   the new transcript does not include the old reply.
3. In Admin, match the second question to a different thread. Verify the old
   thread is still **Resolved** with its original messages. Leave the new
   conversation available for SIM-11.

**Expected:** The new conversation has its own transcript and status. The
mobile app displays the latest conversation, so a chat history picker is
outside this case.

### SIM-11 — Clear only the local checklist

1. In **Move**, tap **Clear this device's checklist**, then **Cancel**. Verify
   the saved route and progress remain.
2. Repeat on the disposable fixture and confirm **Reset checklist**. Verify
   onboarding returns with empty route fields and default answers.
3. Recreate Route A, including the agreement step. Verify zero progress.
   Switch to Route B and verify its progress was cleared too.
4. Reopen Help. Verify that the SIM-10 thread and message remain available.
   If support setup was blocked, mark this specific assertion blocked.

**Expected:** Reset clears the route, answers, and checkmarks across both routes.
The support conversation remains separate.

### SIM-12 — Accessibility and visual checks

1. With VoiceOver enabled, navigate onboarding, Checklist, Move, and Help.
   Verify city fields have understandable names, province choices announce
   their state, preference controls announce the selected answer, checklist
   checkboxes announce completion, and links and back controls are actionable.
2. Use the largest available accessibility text size and repeat core navigation.
   Inspect clipped headings, wrapped choices, keyboard overlap, bottom tab
   visibility, scroll access to the last control, and the Help buttons.
3. Check normal-size layout, status bar readability as onboarding scrolls,
   and switching system appearance. ReloGo declares light appearance, so
   assess readability without requiring a dark theme. Restore the settings
   changed for the run.

**Expected:** Each core action is reachable and understandable. Record the
screen, exact control, and text-size or VoiceOver setting for defects.

## 5. Recovery and privacy checks

### SIM-13 — Backend interruption and retry

On a dedicated test stack, keep Metro running and make only the local backend
unavailable using a reversible method agreed for that environment. Do not stop
a shared stack. To test the checklist without cached rules, enter a valid
corridor not previously loaded in that app session. For Help, use the existing
chat to observe what a cached conversation shows. Avoid sending a message
during interruption unless this is a planned test of ambiguous writes.

**Expected:** A checklist request without cached data ends in a readable error
with **Try Again**. Help offers recovery such as **Retry** if it cannot load,
and may show a cached transcript while reconciling. Current request budgets
are 8 seconds for the resolver and 10 seconds for support operations. Record
actual elapsed time and whether a development overlay or app screen appeared.
Restore connectivity, verify REST again, and retry. If an ambiguous send asks
to refresh, refresh first and check whether the message already exists before
sending again.

### SIM-14 — Verify the local data boundary

If request inspection is available, capture only sanitized methods, paths, and
relevant payload field names from the app session. During onboarding, editing,
and checking tasks, verify the rules request uses `resolve_corridor_rules`
with only `p_origin_province` and `p_dest_province`. Look for any app writes to
legacy profile or progress tables. Then open Help and verify that the support
flow uses anonymous auth as needed and works with the support thread and
messages. Look for any `support-ai` invocation from the current client.
A UI screenshot, a code review, or a host-only API probe cannot establish
these network assertions. If the capture is unavailable, mark them **BLOCKED**
and record the UI observations separately.

### If the simulator shows a connection error

| Observation | Next action |
| --- | --- |
| Launcher fails or CLI status stalls | Record the launcher output and check Docker, local REST, and the intended simulator separately. REST health alone does not mean the launcher has its configuration. |
| Wrong app, blank screen, or frozen device | Identify the foreground app and the Metro target. Reopen the same ReloGo project. If device controls are frozen, restart the simulator without erasing it. Unsaved form fields may be lost. |
| Checklist and Help both fail but local REST responds | Capture each error and a single retry. Confirm the project came from the local launcher. Check whether simulator Safari can reach the same loopback REST endpoint. Check resolver health separately using a local public key if available, without printing it. The host probe, simulator browser, and app request are three separate results. |
| Checklist works but Help fails | Record whether Help has an existing session and whether local anonymous sign-in and the support schema are available. Preserve local data, and test with a separate disposable simulator if stale state is suspected. |
| An expected app control is missing | If the expected screen loaded and prerequisites were met, record a failure with a screenshot. If tooling prevents inspection, mark the assertion blocked. Continue independent cases. |

## 6. Return the report

Use **PASS** for directly verified behavior, **FAIL** for an observed mismatch
after prerequisites were met, and **BLOCKED** for an assertion you could not
exercise. Use **OBSERVATION** for a note without a failed expectation. If a
case has mixed results, report its substeps individually. Do not infer a pass
from a successful build, a unit test, or an API response.

```markdown
# ReloGo iPhone simulator QA — <run ID and time zone>

- Checkout: <branch, commit, clean or locally modified>
- Environment: <iPhone model, iOS, Xcode, launch mode, local backend and Admin>
- Fixtures: <routes, local schema if checked, reply marker>
- Totals: <PASS / FAIL / BLOCKED / OBSERVATION counts>

| Case or substep | Result | Actual behavior | Evidence or blocker |
| --- | --- | --- | --- |
| SIM-01 | | | |

## Defects
- <ID and title, user impact, preconditions, steps, expected vs. actual,
  reproduction count, and screenshot or redacted log path>

## Follow-ups
- <Blocked case, missing prerequisite, and what is needed to rerun it>
```

Include every case ID and the nine SIM-04 rows in the report. Stop only the
Metro and Admin processes you started when the run is complete. Leave shared
services and test evidence available for follow-up.

Source references for troubleshooting: [local launcher](../../scripts/run-local-app.py),
[checklist requests](../../mobile/lib/checklistQueries.ts),
[local journey storage](../../mobile/lib/localJourney.ts),
[support requests](../../mobile/lib/supportConversation.ts), and
[Admin thread controls](../../admin/src/components/ThreadModal.tsx).
