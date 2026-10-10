#!/usr/bin/env python3
"""Local launcher isolation checks; no running Supabase or network required."""

import base64
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("run_local_app", Path(__file__).with_name("run-local-app.py"))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


def token(role):
    body = base64.urlsafe_b64encode(json.dumps({"role": role}).encode()).decode().rstrip("=")
    return f"header.{body}.synthetic-signature"


class LocalLauncherTests(unittest.TestCase):
    def test_only_loopback_origins_are_accepted(self):
        for url in ["http://127.0.0.1:54321", "http://localhost:54321/", "http://127.0.0.1:54322"]:
            with self.subTest(url=url):
                self.assertEqual(launcher.local_origin(url), url.rstrip("/"))
        for url in [
            None, "https://yskknolxbxfxakgvrcmg.supabase.co", "https://uwfblgllkibbupqyofkl.supabase.co",
            "http://127.0.0.1.example.com:54321", "http://127.0.0.1:54321@evil.test", "http://evil.test@127.0.0.1:54321",
            "http://localhost:54321/rest/v1", "http://localhost:54321?", "http://localhost:54321#", "http://localhost:0",
            "http://localhost:65536", "http://localhost", "https://127.0.0.1:54321", "http://192.168.1.5:54321",
            "http://localhost:54321\n", " http://localhost:54321", "http://[::1]:54321",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                launcher.local_origin(url)

    def test_only_public_anon_credentials_are_accepted(self):
        self.assertEqual(launcher.public_anon_key(token("anon")), token("anon"))
        for key in [None, "", token("service_role"), token("authenticated"), "sb_secret_synthetic", "not.a.jwt", "a.____.b"]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                launcher.public_anon_key(key)

    def test_selected_app_only_gets_local_public_overrides(self):
        original = {"PATH": "/usr/bin", "VITE_SUPABASE_URL": "https://preview.test", "EXPO_PUBLIC_SUPABASE_URL": "https://preview.test"}
        status = {"API_URL": "http://127.0.0.1:54321", "ANON_KEY": token("anon"), "SERVICE_ROLE_KEY": "must-not-forward"}
        for app, prefix in [("admin", "VITE"), ("landing", "NEXT_PUBLIC"), ("mobile", "EXPO_PUBLIC")]:
            with self.subTest(app=app):
                command, env = launcher.prepare_launch(app, status, original, ["--port", "5180"])
                self.assertEqual(command, ["npm", "run", "start" if app == "mobile" else "dev", "--", "--port", "5180"])
                self.assertEqual(env[f"{prefix}_SUPABASE_URL"], status["API_URL"])
                self.assertEqual(env[f"{prefix}_SUPABASE_ANON_KEY"], token("anon"))
                self.assertNotIn("must-not-forward", env.values())
                for key in original:
                    if key != f"{prefix}_SUPABASE_URL":
                        self.assertEqual(env[key], original[key])
        self.assertEqual(original["VITE_SUPABASE_URL"], "https://preview.test")

    def test_invalid_app_does_not_launch(self):
        with self.assertRaises(ValueError):
            launcher.prepare_launch("worker", {}, {}, [])
        with patch.object(launcher.subprocess, "run") as run, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                launcher.main(["production"])
            run.assert_not_called()

    def test_status_failure_does_not_print_credentials(self):
        output = io.StringIO()
        result = SimpleNamespace(returncode=1, stdout="private-server-key", stderr="private-server-key")
        with patch.object(launcher.subprocess, "run", return_value=result), contextlib.redirect_stderr(output):
            self.assertEqual(launcher.main(["admin"]), 1)
        self.assertNotIn("private-server-key", output.getvalue())
        self.assertIn("supabase start", output.getvalue())

    def test_hosted_status_never_starts_an_app(self):
        result = SimpleNamespace(returncode=0, stdout=json.dumps({"API_URL": "https://yskknolxbxfxakgvrcmg.supabase.co", "ANON_KEY": token("anon")}))
        with patch.object(launcher.subprocess, "run", return_value=result), patch.object(launcher.os, "execvpe") as execute, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(launcher.main(["mobile", "--", "--ios"]), 1)
            execute.assert_not_called()


class IosSimulatorPreflightTests(unittest.TestCase):
    def test_non_darwin_is_unavailable_without_probing(self):
        with patch.object(launcher.subprocess, "run") as run:
            self.assertFalse(launcher.ios_simulator_available(platform_name="linux"))
            run.assert_not_called()

    def test_simulator_detected_via_launch_services(self):
        found = SimpleNamespace(returncode=0, stdout="", stderr="")
        with patch.object(launcher.subprocess, "run", return_value=found) as run:
            self.assertTrue(launcher.ios_simulator_available(platform_name="darwin"))
            run.assert_called_once()

    def test_simulator_detected_from_developer_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "Applications" / "Simulator.app").mkdir(parents=True)
            missing = SimpleNamespace(returncode=1, stdout="", stderr="")
            developer = SimpleNamespace(returncode=0, stdout=tmp, stderr="")
            with patch.object(launcher.subprocess, "run", side_effect=[missing, developer]):
                self.assertTrue(launcher.ios_simulator_available(platform_name="darwin"))

    def test_device_hub_detected_next_to_developer_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            xcode_contents = Path(tmp) / "Xcode.app" / "Contents"
            developer_dir = xcode_contents / "Developer"
            developer_dir.mkdir(parents=True)
            (xcode_contents / "Applications" / "DeviceHub.app").mkdir(parents=True)
            missing = SimpleNamespace(returncode=1, stdout="", stderr="")
            developer = SimpleNamespace(returncode=0, stdout=str(developer_dir), stderr="")
            with patch.object(launcher.subprocess, "run", side_effect=[missing, developer]):
                self.assertTrue(launcher.ios_simulator_available(platform_name="darwin"))

    def test_simulator_missing_when_launch_services_and_bundle_fail(self):
        missing = SimpleNamespace(returncode=1, stdout="", stderr="")
        with patch.object(launcher.subprocess, "run", side_effect=[missing, missing]):
            self.assertFalse(launcher.ios_simulator_available(platform_name="darwin"))

    def test_ios_preflight_only_checks_mobile_ios_on_darwin(self):
        with patch.object(launcher, "ios_simulator_available", return_value=False) as available:
            self.assertIsNone(launcher.ios_preflight_error("mobile", ["--ios"], platform_name="linux"))
            self.assertIsNone(launcher.ios_preflight_error("mobile", ["--clear"], platform_name="darwin"))
            self.assertIsNone(launcher.ios_preflight_error("admin", ["--ios"], platform_name="darwin"))
            self.assertEqual(
                launcher.ios_preflight_error("mobile", ["--ios"], platform_name="darwin"),
                launcher.IOS_SIMULATOR_MISSING,
            )
        self.assertEqual(available.call_count, 1)

    def test_missing_simulator_blocks_before_supabase_and_launch(self):
        stderr = io.StringIO()
        with patch.object(launcher, "ios_preflight_error", return_value=launcher.IOS_SIMULATOR_MISSING), \
             patch.object(launcher.subprocess, "run") as run, \
             patch.object(launcher.os, "execvpe") as execute, \
             contextlib.redirect_stderr(stderr):
            self.assertEqual(launcher.main(["mobile", "--", "--ios"]), 1)
            run.assert_not_called()
            execute.assert_not_called()
        self.assertIn("DeviceHub.app", stderr.getvalue())
        self.assertIn("xcode-select --print-path", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
