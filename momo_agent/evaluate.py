"""Chapter 12: run a suite of topics through the pipeline and report what happened; nothing is written to the repo."""
import json
import os
import time
from dataclasses import dataclass

from momo_agent.guard import Budget, BudgetExceeded, TopicRejected
from momo_agent.llm import NoStructuredOutput, make_model
from momo_agent.pipeline import LessonInvalid, generate_lesson
from momo_agent.repo import Repo
from momo_agent.vocab import LessonRefused


@dataclass
class CaseResult:
    topic: str
    expect: str
    status: str
    detail: str
    rewrites: dict[str, int]
    calls: int
    tokens: int
    seconds: float

    @property
    def passed(self) -> bool:
        return self.status == self.expect


async def run_case(case: dict, repo: Repo) -> CaseResult:
    fixtures = None
    if os.environ.get("MOMO_LLM_PROVIDER", "fake") == "fake":
        fixtures = json.loads((repo.root / case["fixtures"]).read_text("utf-8"))
    budget = Budget.from_env()
    rewrites: dict[str, int] = {}
    status, detail = "ok", ""
    start = time.perf_counter()
    try:
        await generate_lesson(case["topic"], repo, lambda role: make_model(role, fixtures, budget),
                              overwrite=True, rewrites=rewrites)
    except LessonRefused as err:
        status, detail = "refused", f"{len(err.found)} illustrated words found"
    except TopicRejected as err:
        status, detail = "rejected", str(err)
    except (LessonInvalid, NoStructuredOutput) as err:
        status, detail = "invalid", str(err)
    except BudgetExceeded:
        status, detail = "budget", budget.summary()
    except Exception as err:  # one broken case must not stop the suite
        status, detail = "error", f"{type(err).__name__}: {err}"
    return CaseResult(case["topic"], case["expect"], status, detail, rewrites,
                      budget.calls, budget.tokens, time.perf_counter() - start)


async def run_suite(cases: list[dict], repo: Repo) -> list[CaseResult]:
    return [await run_case(case, repo) for case in cases]


def format_report(results: list[CaseResult]) -> str:
    lines = []
    for r in results:
        verdict = "PASS" if r.passed else "FAIL"
        lines.append(f"{verdict}  {r.topic}  {r.status}  rewrites={r.rewrites.get('story', 0)}/{r.rewrites.get('dialogue', 0)}"
                     f"  calls={r.calls}  tokens={r.tokens}  {r.seconds:.1f}s")
    lines.append(f"{sum(r.passed for r in results)}/{len(results)} passed")
    return "\n".join(lines)
