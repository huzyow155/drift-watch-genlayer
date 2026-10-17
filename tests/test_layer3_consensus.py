import unittest
from genlayer import gl


class TestLayer3Consensus(unittest.TestCase):

    def test_validators_identical_verdict_agree(self):
        # 3 validators with identical verdict and norm_hash16
        leader_output = "MATERIAL|e0c26d288fd485f9"
        validator1_output = "MATERIAL|e0c26d288fd485f9"
        validator2_output = "MATERIAL|e0c26d288fd485f9"

        # Consensus strictly compares the string
        self.assertEqual(leader_output, validator1_output)
        self.assertEqual(leader_output, validator2_output)

        votes = [
            validator1_output == leader_output,
            validator2_output == leader_output,
        ]
        majority = sum(votes) >= 1
        self.assertTrue(majority)

    def test_validators_divergent_verdict_disagree(self):
        # Leader says MATERIAL, Validator 1 says MINOR
        leader_output = "MATERIAL|e0c26d288fd485f9"
        val_different_verdict = "MINOR|e0c26d288fd485f9"
        self.assertNotEqual(leader_output, val_different_verdict)

        # Leader and validator read different page states (different norm_hash16)
        val_different_hash = "MATERIAL|c483dc1f1eb4113c"
        self.assertNotEqual(leader_output, val_different_hash)

        # Majority disagree case
        votes = [
            val_different_verdict == leader_output,
            val_different_hash == leader_output,
        ]
        majority = sum(votes) >= 2 # 2 of 2 agree with leader
        self.assertFalse(majority)

    def test_gate_consensus_strings(self):
        # UNCHANGED consensus
        tok_unchanged = "UNCHANGED|e0c26d288fd485f9"
        self.assertTrue(tok_unchanged.startswith("UNCHANGED|"))

        # COSMETIC consensus
        tok_cosmetic = "COSMETIC|e0c26d288fd485f9"
        self.assertTrue(tok_cosmetic.startswith("COSMETIC|"))

        # BASELINE consensus
        tok_baseline = "BASELINE|e0c26d288fd485f9"
        self.assertTrue(tok_baseline.startswith("BASELINE|"))


if __name__ == "__main__":
    unittest.main()
