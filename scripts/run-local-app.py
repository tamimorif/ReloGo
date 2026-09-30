#!/usr/bin/env python3
"""Start an app against running local Supabase without changing .env files."""

import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_SETTINGS = {
    "admin": ("VITE", ["npm", "run", "dev"]),
    "landing": ("NEXT_PUBLIC", ["npm", "run", "dev"]),
    "mobile": ("EXPO_PUBLIC", ["npm", "run", "start"]),
}


def local_origin(value):
    """Accept only bare HTTP origins reachable by browsers/iOS Simulator."""
    if not isinstance(value, str):
        raise ValueError("Local Supabase status is missing API_URL.")
    try:
        parsed = urlsplit(value)
        valid = (
            parsed.scheme == "http"
            and parsed.hostname in {"127.0.0.1", "localhost"}
            and parsed.port is not None
            and parsed.port > 0
            and parsed.username is None
            and parsed.password is None
            and value in {f"http://{parsed.netloc}", f"http://{parsed.netloc}/"}
        )
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("Refusing a non-local or malformed Supabase API_URL.")
    return value.rstrip("/")


def public_anon_key(value):
    """Keep service credentials from being copied into a client environment."""
    try:
        if not isinstance(value, str) or len(value.split(".")) != 3:
            raise ValueError
        payload = value.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if claims.get("role") != "anon":
            raise ValueError
    except (ValueError, TypeError, AttributeError, UnicodeError):
        raise ValueError("Local Supabase status must provide a public ANON_KEY.") from None
    return value


def prepare_launch(app, status, inherited_env, arguments):
    if app not in APP_SETTINGS:
        raise ValueError("Choose admin, landing, or mobile.")
    if not isinstance(status, dict):
        raise ValueError("Local Supabase returned an invalid status document.")
    url = local_origin(status.get("API_URL"))
    anon_key = public_anon_key(status.get("ANON_KEY"))
    prefix, command = APP_SETTINGS[app]
    env = dict(inherited_env)
    env[f"{prefix}_SUPABASE_URL"] = url
    env[f"{prefix}_SUPABASE_ANON_KEY"] = anon_key
    return [*command, "--", *arguments], env


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", choices=APP_SETTINGS)
    parser.add_argument("arguments", nargs=argparse.REMAINDER, help="Arguments forwarded to the app's dev server after --")
    args = parser.parse_args(argv)
    forwarded = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
    try:
        # Status contains server secrets too: capture it in memory and never
        # forward its raw output (including stderr) to the terminal or a file.
        result = subprocess.run(
            ["supabase", "status", "--output", "json"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=20,
        )
        if result.returncode:
            raise ValueError("Local Supabase is unavailable. Run 'supabase start' from the repository root.")
        try:
            status = json.loads(result.stdout)
        except json.JSONDecodeError:
            raise ValueError("Local Supabase returned an invalid status document.") from None
        command, env = prepare_launch(args.app, status, os.environ, forwarded)
    except (OSError, subprocess.TimeoutExpired):
        print("Unable to read local Supabase status. Check the Supabase CLI and Docker, then run 'supabase start'.", file=sys.stderr)
        return 1
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    prefix = APP_SETTINGS[args.app][0]
    print(f"Starting {args.app} against {env[f'{prefix}_SUPABASE_URL']} (process-only override).", flush=True)
    os.chdir(REPO_ROOT / args.app)
    try:
        os.execvpe(command[0], command, env)
    except OSError:
        print("Unable to start npm. Install Node 22 and the app dependencies first.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
