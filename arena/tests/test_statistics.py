import sys
import unittest
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from match_statistics import paired_summary
from run_match import Candidate, Opening, run_game
import chess


def report(result="1/2-1/2", white="a", **extra):
    return {"white": white, "result": result, "termination": "threefold repetition", "crash": None, **extra}


class EvidenceTests(unittest.TestCase):
    def test_all_draws_do_not_prove_equality_or_superiority(self):
        stats = paired_summary([report() for _ in range(40)], "a")
        self.assertEqual(stats["pairScore"], 0.5)
        self.assertLess(stats["score95"][0], 0.5)
        self.assertGreater(stats["score95"][1], 0.5)
        self.assertFalse(stats["evidenceOfSuperiority"])

    def test_unfinished_pair_excluded_not_converted_to_draw(self):
        stats = paired_summary([report("1-0"), report("*")], "a")
        self.assertIsNone(stats["pairScore"])
        self.assertEqual(stats["competitionPoints"], 3)
        self.assertFalse(stats["stable"])

    def test_perspective_and_failure_gate(self):
        reports = [r for _ in range(40) for r in [report("1-0"), report("0-1", white="b")]]
        self.assertTrue(paired_summary(reports, "a")["evidenceOfSuperiority"])
        reports[0]["crash"] = {"candidate": "b"}
        self.assertFalse(paired_summary(reports, "a")["evidenceOfSuperiority"])

    def test_repeated_opening_does_not_inflate_independent_sample(self):
        stats = paired_summary([report(opening_key="same-position") for _ in range(80)], "a")
        self.assertEqual(stats["completedPairs"], 40)
        self.assertEqual(stats["distinctOpeningClusters"], 1)
        self.assertEqual(stats["score95"], [0, 1])

    def test_mate_on_final_allowed_ply_counts_as_win(self):
        command = (sys.executable, str(Path(__file__).with_name("fake_uci.py")))
        candidate = Candidate("fake", command, {})
        opening = Opening(chess.STARTING_FEN, tuple(chess.Move.from_uci(m) for m in ["f2f3", "e7e5", "g2g4", "d8h4"]), "mate")
        _, outcome = run_game(candidate, candidate, opening, 2, 0, 4)
        self.assertEqual(outcome["result"], "0-1")

    def test_unresponsive_engine_does_not_hang_arena(self):
        script = str(Path(__file__).with_name("fake_uci.py"))
        stalled = Candidate("stalled", (sys.executable, script, "--stall"), {})
        normal = Candidate("normal", (sys.executable, script), {})
        started = time.monotonic()
        _, outcome = run_game(stalled, normal, Opening(chess.STARTING_FEN, (), "start"), 0.1, 0, 10)
        self.assertLess(time.monotonic() - started, 5)
        self.assertEqual(outcome["result"], "0-1")
        self.assertEqual(outcome["crash"]["candidate"], "stalled")


if __name__ == "__main__":
    unittest.main()
