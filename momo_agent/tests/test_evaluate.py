import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from momo_agent.__main__ import main
from momo_agent.evaluate import CaseResult, format_report, run_suite
from momo_agent.repo import Repo

ROOT = Path(__file__).resolve().parents[2]
SUITE = ROOT / "momo_agent/eval/suite.json"
BIRTHDAY = "momo_agent/fixtures/birthday.json"


def porcelain() -> str:
    return subprocess.run(["git", "status", "--porcelain", "static", "momo_agent"],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout


class EvaluateTest(unittest.IsolatedAsyncioTestCase):
    async def test_suite_matches_expectations(self):
        results = await run_suite(json.loads(SUITE.read_text("utf-8")), Repo(ROOT))
        self.assertEqual(len(results), 4)
        self.assertTrue(all(r.passed for r in results), [(r.topic, r.status, r.detail) for r in results])
        by_fixture = {r.expect + str(i): r for i, r in enumerate(results)}
        self.assertEqual(results[1].rewrites["story"], 1)
        self.assertEqual(by_fixture["refused2"].calls, 2)
        self.assertEqual(by_fixture["rejected3"].calls, 0)

    def test_eval_writes_nothing(self):
        before = porcelain()
        with contextlib.redirect_stdout(io.StringIO()):
            main(["eval"], root=ROOT)
        self.assertEqual(porcelain(), before)

    async def test_unexpected_error_does_not_stop_suite(self):
        fx = json.loads((ROOT / BIRTHDAY).read_text("utf-8"))
        fx["story"] = []
        with tempfile.TemporaryDirectory() as tmp:
            broken = Path(tmp) / "broken.json"
            broken.write_text(json.dumps(fx, ensure_ascii=False), "utf-8")
            cases = [{"topic": "生日会", "fixtures": str(broken), "expect": "ok"},
                     {"topic": "生日会", "fixtures": BIRTHDAY, "expect": "ok"}]
            results = await run_suite(cases, Repo(ROOT))
        self.assertEqual(results[0].status, "error")
        self.assertIn("RuntimeError", results[0].detail)
        self.assertEqual(results[1].status, "ok")

    def test_report_format(self):
        result = CaseResult("生日会", "ok", "ok", "", {"story": 0, "dialogue": 0}, 4, 0, 0.123)
        lines = format_report([result]).splitlines()
        self.assertTrue(lines[0].startswith("PASS  生日会  ok  rewrites=0/0"), lines[0])
        self.assertEqual(lines[-1], "1/1 passed")

    def test_cli_eval_exit_code(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["eval"], root=ROOT), 0)
