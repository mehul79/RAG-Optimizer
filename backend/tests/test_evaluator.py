"""Zero-cost tests: pure scoring math from evaluator.py, no LLM calls."""

from app.services.evaluator import score_faithfulness, score_precision, score_relevancy


def test_faithfulness():
    assert score_faithfulness([]) == 0.0
    assert score_faithfulness([{"supported": True}, {"supported": False}]) == 0.5
    assert score_faithfulness([{"supported": True}] * 3) == 1.0


def test_relevancy():
    assert score_relevancy([]) == 0.0
    qs = [{"similarity_to_original": 1.0}, {"similarity_to_original": 0.5}]
    assert score_relevancy(qs) == 0.75


def test_precision_rank_weighted():
    assert score_precision([]) == 0.0
    # useful at rank 1 and 3: (1/1 + 2/3) / 2 = 0.8333
    chunks = [{"useful": True}, {"useful": False}, {"useful": True}]
    assert score_precision(chunks) == 0.8333
    # all useless
    assert score_precision([{"useful": False}] * 4) == 0.0


if __name__ == "__main__":
    test_faithfulness()
    test_relevancy()
    test_precision_rank_weighted()
    print("all evaluator checks passed")
