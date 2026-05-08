---
name: upgrade-passport
description: >-
  Detect and apply kpass CLI updates automatically. Invoke whenever a
  `kpass --output json` response carries an `update_available` field, or when
  the user asks to "update kpass", "upgrade", "is my CLI up to date?". On
  POSIX (macOS, Linux), the agent SHOULD upgrade automatically after the
  user's current task completes — no permission prompt needed. On Windows,
  the agent surfaces the manual install command for the user to run; the
  agent must NOT auto-execute PowerShell install scripts. Auto-upgrade is on
  by default; `KPASS_AUTO_UPGRADE=1` is the explicit form, `=0` disables it
  (agent surfaces the update to the user but doesn't apply it without
  confirmation). `KPASS_NO_UPDATE_CHECK=1` disables detection entirely.
user-invocable: true
allowed-tools:
  - "Bash(kpass upgrade*)"
  - "Bash(kpass --version*)"
---

# Upgrade Passport

Update the `kpass` CLI in place (POSIX) or surface the right manual-install command (Windows). Also the place to interpret the optional `update_available` field that may appear in any `kpass --output json` envelope.

## When to Use This Skill

**Automatic triggers (no user prompt needed):**

- A prior `kpass <anything> --output json` response included an `update_available` field. Auto-upgrade on POSIX; surface the install command on Windows. See **Auto-Upgrade Behavior** below for the exact rules.
- The user's current task just finished and you want to opportunistically refresh the CLI before the next command.

**User-driven triggers:**

- The user asks: "update kpass", "upgrade", "is there a newer version?", "what version am I on?"
- The user wants to switch channels (`latest` ↔ `stable`) or pin a specific bundle.

**Diagnostic triggers:**

- Before troubleshooting another command's failure, confirm the CLI is current — running an old CLI against a newer backend is a common root cause.

## When NOT to Use This Skill

- For a **first-time install**: this skill assumes `kpass` is already installed via `install.sh` / `install.ps1`. If not, point the user at the installer:
  - macOS / Linux: `curl -fsSL https://cli.gokite.ai/install.sh | bash`
  - Windows: `irm https://cli.gokite.ai/install.ps1 | iex`
- For installing or updating **passport-skills only**. Skills are upgraded together with the CLI as part of a single bundle.
- For switching environments (prod ↔ staging). That's a fresh install against the other domain, not an upgrade.

## Prerequisites

- `kpass` was installed via the install script. The skill detects this from `~/.kpass/version.json`. If that file is missing, `kpass upgrade` exits 1 with a reinstall hint and you should follow it.
- No authentication required. Upgrade is a local + CDN operation; it doesn't talk to the Kite backend.

## Defaults (Do Not Ask the User Unless They Specify Otherwise)

| Setting | Default value | Override |
|---|---|---|
| Output format | `--output json` | Always use JSON output. Never omit this flag. |
| Channel | Sticky from the install (`latest` for most users) | Only pass `--channel <c>` if the user explicitly asks to switch. |
| Bundle | Resolved from the channel pointer | Only pass `--bundle <N>` if the user explicitly pins to a number. |
| Force | Off | Only pass `--force` if the user explicitly asks to reinstall the same bundle. |
| Auto-execute on Windows | **Never** | The Windows upgrade flow returns an `install_command` string. Show it to the user; they run it themselves. |

---

## Auto-Upgrade Behavior (Read This First)

Every `kpass <command> --output json` may include this optional top-level field:

```json
"update_available": {
  "current_bundle":  21,
  "latest_bundle":   22,
  "channel":         "latest",
  "install_command": "kpass upgrade"
}
```

When you see it, follow these rules **without asking the user for permission first** (unless `KPASS_AUTO_UPGRADE=0` is set — see overrides below).

### Rule 1 — POSIX (macOS, Linux): auto-upgrade after the current task

**Detection:** `update_available.install_command` equals `"kpass upgrade"`.

**Action:** Once the user's current task completes (a payment finishes, a search returns results, etc.), invoke this skill and run `kpass upgrade --output json` immediately. After the upgrade succeeds, briefly tell the user what was upgraded:

> Upgraded kpass: bundle 21 → 22 (CLI 1.3.18, ksearch 1.0.4, skills 1.1.8).

If the upgrade fails, surface the error and continue with whatever else the user was doing — don't abandon the original task because of a failed background upgrade.

### Rule 2 — Windows: never auto-execute, surface the install command

**Detection:** `update_available.install_command` starts with `"irm "` (PowerShell `Invoke-RestMethod`).

**Action:** Do **not** run the command yourself. PowerShell's `irm | iex` executes arbitrary remote code; that's a user decision, not an agent decision. Show the command to the user verbatim:

> A newer Kite Passport bundle is available (22). To upgrade on Windows, run this in a PowerShell prompt:
>
> ```
> irm https://cli.gokite.ai/install.ps1 | iex
> ```
>
> I can't run it for you on Windows — please run it yourself, then re-run your original task in a fresh shell.

### Rule 3 — when NOT to auto-upgrade (even on POSIX)

Skip the auto-upgrade and defer to a future invocation if any of these are true:

- A payment, checkout, or x402 execute call is mid-flight (`x402-execute` or `shopping` is the active skill).
- A session-approval poll is running (`request-session` waiting for the user's passkey approval).
- The user is in a multi-step interactive flow (TUI prompts, OTP entry, etc.).
- The current command's exit code was non-zero — fix the underlying issue first, don't pile a CLI upgrade on top of an already-broken flow.

In all of these cases, just keep the field in mind and trigger the upgrade once the active flow finishes cleanly.

### Overrides

| Env var / state | Effect on auto-upgrade |
|---|---|
| `KPASS_AUTO_UPGRADE=1` (or unset) | **Default.** Auto-upgrade is on. Apply Rule 1 (POSIX) or Rule 2 (Windows) when `update_available` appears, no permission prompt. |
| `KPASS_AUTO_UPGRADE=0` | Auto-upgrade is **off**. Detection still happens; surface the update info to the user and ask before running `kpass upgrade`. Equivalent to "manual upgrade only." |
| `KPASS_NO_UPDATE_CHECK=1` | Detection itself is suppressed — `update_available` will never appear, so this skill won't trigger automatically. The user can still invoke it manually via `kpass upgrade`. |
| `CI=1` | Same as `KPASS_NO_UPDATE_CHECK` — automatic detection off in CI runners. |
| The user explicitly says "don't upgrade" | Honor it for the rest of the session even without an env var. |

### When the field is omitted, possible reasons

- The user is current (or pinned ahead of) the channel.
- `KPASS_NO_UPDATE_CHECK=1` or `CI=1` is set.
- The local cache hasn't been refreshed yet (a freshly installed CLI populates the cache on its second invocation).

Treat omission as "no action needed" — do not interpret it as a problem.

---

## Command Reference

### `upgrade --check` — is the CLI up to date?

Read-only. No filesystem mutation, minimal network: just fetches the channel pointer and compares.

```bash
kpass upgrade --check --output json
```

Optional flags:

| Flag | Purpose |
|---|---|
| `--channel <c>` | Peek at a different channel (`latest` or `stable`) without committing |
| `--output json` | Always pass |

#### Exit codes

| Exit code | Meaning |
|---|---|
| 0 | Up to date (or pinned ahead) |
| 10 | Behind — a newer bundle is available |
| 1 | Network error or unreadable `version.json` |
| 4 | Channel not deployed in this environment (e.g. `--channel stable` against prod where stable doesn't exist yet) |

The exit code is the most reliable signal. Shell consumers can do `if ! kpass upgrade --check; then …`.

#### Output — current (exit 0)

```json
{
  "_version": "1",
  "status": "success",
  "current_bundle": 22,
  "latest_bundle": 22,
  "channel": "latest",
  "behind": false,
  "hint": "kpass is up to date (bundle 22, channel latest).",
  "next_command": ""
}
```

#### Output — behind (exit 10)

```json
{
  "_version": "1",
  "status": "success",
  "current_bundle": 21,
  "latest_bundle": 22,
  "channel": "latest",
  "behind": true,
  "hint": "kpass bundle 22 available (current: 21, channel latest). Run: kpass upgrade",
  "next_command": "kpass upgrade"
}
```

Note `status: "success"` even when behind — the *check* succeeded; the `behind` boolean and exit code 10 carry the world-state signal.

`next_command` is platform-aware: on Windows it reads `"irm https://cli.gokite.ai/install.ps1 | iex"`. Use it verbatim when prompting the user.

---

### `upgrade` — apply the latest bundle on the install's channel

```bash
kpass upgrade --output json
```

Optional flags:

| Flag | Purpose |
|---|---|
| `--channel <c>` | Switch sticky channel (`latest` or `stable`) and upgrade |
| `--force` | Reinstall even if already on the latest bundle |
| `--output json` | Always pass |

#### Output — POSIX success (exit 0)

```json
{
  "_version": "1",
  "status": "success",
  "from_bundle": 21,
  "to_bundle": 22,
  "channel": "latest",
  "cli_version": "1.3.18",
  "ksearch_version": "1.0.4",
  "skills_version": "1.1.8",
  "hint": "Upgraded to bundle 22.",
  "next_command": ""
}
```

The CLI atomically swaps `~/.kpass/` to the new bundle. The next time the user runs `kpass <anything>`, they get the new binary.

#### Output — already current (exit 0)

```json
{
  "_version": "1",
  "status": "success",
  "current_bundle": 22,
  "target_bundle": 22,
  "channel": "latest",
  "behind": false,
  "hint": "kpass is up to date (bundle 22, channel latest).",
  "next_command": ""
}
```

#### Output — Windows manual upgrade required (exit 0)

```json
{
  "_version": "1",
  "status": "human_action_required",
  "action": "manual_upgrade",
  "current_bundle": 21,
  "target_bundle": 22,
  "channel": "latest",
  "install_command": "irm https://cli.gokite.ai/install.ps1 | iex",
  "hint": "kpass upgrade is not supported on Windows yet. Run: irm https://cli.gokite.ai/install.ps1 | iex",
  "next_command": "irm https://cli.gokite.ai/install.ps1 | iex"
}
```

**Critical Windows handling:**

- `status: "human_action_required"` means the user must take an action. Exit code is 0 — *not* an error.
- **Show `install_command` to the user verbatim. Do not auto-execute it.** PowerShell's `irm | iex` runs arbitrary code; the user must consent and run it themselves from their terminal.
- After the user runs the install command, they should re-run their original task in a fresh shell.

#### Output — not installed via install.sh (exit 1)

```json
{
  "_version": "1",
  "status": "error",
  "error": "kpass was not installed via install.sh.",
  "hint": "Reinstall: curl -fsSL https://cli.gokite.ai/install.sh | bash",
  "next_command": ""
}
```

Direct the user to the install script (POSIX) or PowerShell installer (Windows). After install, they can run `kpass upgrade` going forward.

---

### `upgrade --bundle N` — pin to a specific bundle

```bash
kpass upgrade --bundle 22 --output json
```

| Behavior | Detail |
|---|---|
| Channel | Preserved from `version.json`; pinning never silently changes channels |
| Mutually exclusive | `--bundle` cannot be combined with `--channel` (exit 2) |
| Downgrade allowed | Pinning to a bundle lower than current works without prompts; the atomic swap rolls back if the target binary fails to run |
| Manifest 404 | Exit 4: `Bundle N not found at <base>` |

Use cases:
- Reproducing a known-good environment for debugging.
- Reverting a flaky upgrade without waiting for a new release.
- CI: pin to a specific bundle for deterministic builds.

---

## Quick Decision Flow

```text
Agent sees `update_available` in any kpass JSON envelope
                |
                v
   Is the user mid-task? (payment, checkout, OTP entry, etc.)
                |
        +-------+--------+
        |                |
       yes               no
        |                |
        v                v
   Skip for now.    Is install_command "kpass upgrade" (POSIX)
   Re-evaluate          or "irm ..." (Windows)?
   after the task            |
   completes.        +-------+--------+
                     |                |
                  POSIX            Windows
                     |                |
                     v                v
              Run `kpass upgrade   Show install_command
              --output json`       to user verbatim.
              without asking.      Tell them to run it
              Tell user the        in PowerShell, then
              outcome.             re-run their task in
                                   a fresh shell.

Manual flow (user explicitly asked):

   User asks "is kpass up to date?" / "upgrade kpass"
                |
                v
   kpass upgrade --check --output json
                |
        +-------+--------+
        |                |
   exit 0           exit 10 (behind)
   (current)            |
        |               v
        v        Apply per Rule 1 (POSIX) or Rule 2 (Windows).
   Tell user:
   "kpass is up to date."
```

---

## Worked Examples

### Example 1 — Quick check on POSIX (current)

```bash
kpass upgrade --check --output json
```

Exit 0, output:
```json
{"_version":"1","status":"success","current_bundle":22,"latest_bundle":22,"channel":"latest","behind":false,"hint":"kpass is up to date (bundle 22, channel latest).","next_command":""}
```

Tell the user: "Your kpass is up to date (bundle 22, latest channel)."

### Example 2 — Auto-detect + auto-upgrade on POSIX

The user just asked the agent to send 5 USDC. The wallet-send response carried:

```json
{
  "transaction_hash": "0x…",
  "_version": "1",
  "status": "success",
  "hint": "Sent 5 USDC.",
  "next_command": "",
  "update_available": {
    "current_bundle": 21,
    "latest_bundle": 22,
    "channel": "latest",
    "install_command": "kpass upgrade"
  }
}
```

The transfer succeeded (the user's primary task is done). `install_command` is `"kpass upgrade"` → POSIX → Rule 1 applies → upgrade automatically.

```bash
kpass upgrade --output json
```

Exit 0, output:
```json
{"_version":"1","status":"success","from_bundle":21,"to_bundle":22,"channel":"latest","cli_version":"1.3.18","ksearch_version":"1.0.4","skills_version":"1.1.8","hint":"Upgraded to bundle 22.","next_command":""}
```

Tell the user (one combined message):

> Sent 5 USDC successfully (tx 0x…). I also upgraded kpass to bundle 22 (CLI 1.3.18) since a newer version was available.

Do not ask permission first — the upgrade is automatic, the report comes after.

### Example 2b — Manual upgrade flow (user explicitly asked)

User: "Is my kpass up to date?"

```bash
kpass upgrade --check --output json
```

Exit 10:
```json
{"_version":"1","status":"success","current_bundle":21,"latest_bundle":22,"channel":"latest","behind":true,"hint":"kpass bundle 22 available (current: 21, channel latest). Run: kpass upgrade","next_command":"kpass upgrade"}
```

User explicitly asked, so per the manual-flow branch in the decision diagram, just go ahead and apply:

```bash
kpass upgrade --output json
```

Tell the user: "You were on bundle 21, latest is 22. Upgraded — you're now on bundle 22 (CLI 1.3.18)."

### Example 3 — Behind on Windows, surface install command (no agreement needed)

The Windows path is fundamentally different from POSIX. There is no agent action that can perform the upgrade — only the user can run the install script. So whether `update_available` was detected automatically or the user explicitly asked, the response is the same: surface the command verbatim.

```bash
kpass upgrade --check --output json
```

Exit 10, output:
```json
{"_version":"1","status":"success","current_bundle":21,"latest_bundle":22,"channel":"latest","behind":true,"hint":"kpass bundle 22 available (current: 21, channel latest). Run: irm https://cli.gokite.ai/install.ps1 | iex","next_command":"irm https://cli.gokite.ai/install.ps1 | iex"}
```

Tell the user verbatim:
> Bundle 22 is available. To upgrade on Windows, run this in a PowerShell prompt:
>
> ```
> irm https://cli.gokite.ai/install.ps1 | iex
> ```
>
> I can't run it for you on Windows — please run it yourself, then re-run your original task in a fresh shell.

**Do not** invoke `kpass upgrade` on Windows (it would just emit a `human_action_required` envelope with the same install_command — no actual upgrade happens). **Do not** spawn PowerShell to execute the irm command. Both would violate Rule 2.

### Example 4 — User wants to switch to stable

```bash
kpass upgrade --channel stable --output json
```

If stable is deployed in this environment, the CLI fetches that channel pointer and applies it. The new `version.json` records `channel: "stable"` so future `kpass upgrade` calls follow stable. If stable is not deployed (exit 4), tell the user: "The stable channel isn't deployed in this environment. Try `--channel latest`."

### Example 5 — Skip auto-upgrade because the user is mid-task

The user is in the middle of a checkout flow — `kpass agent:session create` returned `human_action_required` (waiting for the user to approve a delegation via passkey). The response included:

```json
{
  "request_id": "req_…",
  "approval_url": "https://…",
  "_version": "1",
  "status": "human_action_required",
  "hint": "Visit the approval URL to authorize the session.",
  "next_command": "kpass agent:session status --request-id req_… --wait",
  "update_available": {
    "current_bundle": 21,
    "latest_bundle": 22,
    "channel": "latest",
    "install_command": "kpass upgrade"
  }
}
```

`update_available` is present, but Rule 3 applies — the user is mid-flow waiting on approval. **Do not auto-upgrade right now.** Continue with `kpass agent:session status --wait`. After the session is approved AND the user's downstream task (the actual purchase / API call) completes, then upgrade.

This is the most common reason to defer: a new CLI version mid-flow could change behavior under the user's feet, and the new bundle's skills might not match the version the agent just loaded into context.

### Example 6 — `KPASS_AUTO_UPGRADE=0` requires confirmation

The user's environment has `KPASS_AUTO_UPGRADE=0` (auto-upgrade disabled, detection still on). After a kpass call returned `update_available`, the agent surfaces the update and asks before applying:

> Bundle 22 is available (you're on 21). Want me to upgrade now? It will run `kpass upgrade`.

Only proceed after the user agrees. This is the same flow as Example 2b — manual confirmation — but triggered by the env var instead of an explicit user request.

---

## Error Handling

| Exit Code | Meaning | Pattern | Recovery |
|---|---|---|---|
| 0 | Success — applied, current, or `human_action_required` (Windows) | `status: success` or `human_action_required` | Read the envelope; for `human_action_required`, surface `install_command` to the user. |
| 1 | Network / IO / version.json missing | `Reinstall: curl …` hint | Check connectivity; if version.json is missing, run the install script. |
| 2 | Bad flag combination | `--check cannot be combined with …` etc. | Drop the offending flag. See Defaults. |
| 4 | Channel or bundle not found | `Channel "stable" is not available at <base>` or `Bundle N not found` | Try a different `--channel` or correct the `--bundle` number. |
| 10 | `--check` reports behind | `kpass bundle <N> available …` | Auto-upgrade per Rule 1 (POSIX) or surface the install command per Rule 2 (Windows). Only ask the user first if `KPASS_AUTO_UPGRADE=0`. |

Common pitfalls:
- Treating exit 10 as a failure. It's a *signal*, not an error. The check itself succeeded.
- Calling `kpass upgrade` on Windows expecting the swap to happen. It won't — surface `install_command` instead.
- Looping `kpass upgrade --check` in a tight cycle. The cache only refreshes once per 24h; rapid polling won't see new data.
- Asking the user "want me to upgrade?" when `KPASS_AUTO_UPGRADE=0` is NOT set. The default is auto-upgrade on POSIX after the current task; asking for permission first is itself a deviation from the spec.
- Auto-upgrading mid-task (mid-payment, mid-checkout, mid-OTP). Apply Rule 3 — defer until the active flow finishes cleanly.

---

## Behavior Knobs

| Env var | Value | Effect |
|---|---|---|
| `KPASS_AUTO_UPGRADE` | `1` (or unset) | **Default.** Auto-upgrade enabled. Agent applies Rule 1 (POSIX) or Rule 2 (Windows) when `update_available` appears, no permission prompt. |
| `KPASS_AUTO_UPGRADE` | `0` | Auto-upgrade disabled. Detection still happens; agent surfaces the update info and asks the user before running `kpass upgrade`. The auto-apply step is gated. |
| `KPASS_NO_UPDATE_CHECK` | `1` | All update awareness suppressed: `update_available` field omitted, stderr notice silenced, background cache refresh skipped. The auto-upgrade rules become moot because the field never appears. |
| `CI` | `1` (any non-empty) | Same suppression as `KPASS_NO_UPDATE_CHECK`. Set automatically by most CI runners; the CLI defers to that convention. |

If the user complains the `update_available` field "stopped appearing," check whether `KPASS_NO_UPDATE_CHECK` or `CI` is set in their shell.

If the user complains "kpass keeps upgrading without asking," set `KPASS_AUTO_UPGRADE=0` to require confirmation, or `KPASS_NO_UPDATE_CHECK=1` to silence detection entirely.

---

## Commands That DO NOT Exist

Do NOT attempt any of the following — they will fail:

- `kpass update` — the command is `upgrade`, not `update`.
- `kpass upgrade --auto` / `--yes` — there is no auto-confirm flag.
- `kpass upgrade --version <semver>` — `--bundle` takes an integer (the bundle number), not a semver.
- `kpass upgrade --rollback` — to roll back, use `kpass upgrade --bundle <previous>` to pin to the prior bundle number.
- `kpass upgrade --uninstall` — there is no built-in uninstall; `rm -rf ~/.kpass` plus removing PATH entries does it manually.
- `kpass __check-updates` is a hidden internal subcommand for the background refresh. **Do not invoke it directly** unless explicitly debugging the cache; agents should always go through `kpass upgrade --check`.

---

## Input Validation Checklist

Before running any command, verify:

1. **Platform context**: if running on Windows, plan to surface `install_command` to the user — never auto-execute it.
2. **`--bundle <N>`**: must be a positive integer, not a semver. `kpass upgrade --bundle 1.3.18` will fail (use the bundle number instead, e.g. 22).
3. **`--channel <c>`**: must be `latest` or `stable`. `staging` is an environment, not a channel.
4. **`--check` + `--bundle` / `--force`**: rejected (exit 2). `--check` is read-only.
5. **`--bundle` + `--channel`**: rejected (exit 2). They are mutually exclusive.

---

## Cross-Skill References

- **For first-time install or reinstall**: not a skill — direct the user to `curl -fsSL https://cli.gokite.ai/install.sh | bash` (POSIX) or `irm https://cli.gokite.ai/install.ps1 | iex` (Windows).
- **For diagnostics**: pair with **`manage-agents`** (lists registered agents and sessions) or **`activity`** (transaction history) when troubleshooting unexpected behavior.
- **For the orchestrator**: **`kite-passport`** routes user requests for "update kpass" / "upgrade" / "is my CLI up to date" to this skill.
