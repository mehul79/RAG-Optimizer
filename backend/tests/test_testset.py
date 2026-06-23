"""Zero-cost tests: sampling + rollup math only, no LLM or DB calls."""

from app.api.routes.batches import _rollup
from app.services.testset import sample_chunks


class FakeEval:
    def __init__(self, f, r, p, o):
        self.faithfulness = f
        self.answer_relevancy = r
        self.context_precision = p
        self.overall_score = o


class FakeRun:
    def __init__(self, pipeline_id, cost, evaluation=None):
        self.pipeline_id = pipeline_id
        self.cost_usd = cost
        self.evaluation = evaluation


class FakeExp:
    def __init__(self, winner, runs):
        self.winner_pipeline = winner
        self.pipeline_runs = runs


def test_sample_returns_all_when_small():
    chunks = ["a", "b", "c"]
    assert sample_chunks(chunks, n=15) == chunks


def test_sample_is_stratified_and_sized():
    chunks = [f"chunk-{i}" for i in range(100)]
    sampled = sample_chunks(chunks, n=10, seed=42)
    assert len(sampled) == 10
    # one chunk per positional bucket, in order
    indices = [int(c.split("-")[1]) for c in sampled]
    assert indices == sorted(indices)
    for bucket, idx in enumerate(indices):
        assert bucket * 10 <= idx < (bucket + 1) * 10


def test_sample_skips_blank_chunks():
    assert sample_chunks(["", "  ", "real"], n=5) == ["real"]


def test_rollup_wins_averages_and_cost():
    exps = [
        FakeExp("B", [
            FakeRun("B", 0.001, FakeEval(0.9, 0.8, 0.7, 0.8)),
            FakeRun("C", 0.003, FakeEval(0.5, 0.5, 0.5, 0.5)),
        ]),
        FakeExp("B", [
            FakeRun("B", 0.001, FakeEval(0.7, 0.6, 0.5, 0.6)),
            FakeRun("C", 0.003, None),  # eval failed — excluded from averages
        ]),
    ]
    rollup = {r.pipeline_id: r for r in _rollup(exps)}

    assert rollup["B"].win_count == 2
    assert rollup["C"].win_count == 0
    assert rollup["B"].avg_faithfulness == 0.8
    assert rollup["B"].avg_overall_score == 0.7
    assert rollup["C"].avg_faithfulness == 0.5  # only the evaluated run counts
    assert rollup["B"].total_cost_usd == 0.002
    assert rollup["C"].total_cost_usd == 0.006


def test_rollup_empty():
    assert _rollup([]) == []


if __name__ == "__main__":
    test_sample_returns_all_when_small()
    test_sample_is_stratified_and_sized()
    test_sample_skips_blank_chunks()
    test_rollup_wins_averages_and_cost()
    test_rollup_empty()
    print("all testset checks passed")
