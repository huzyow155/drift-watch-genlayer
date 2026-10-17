import unittest
import json
import hashlib
import os
from genlayer import gl, WebResponse
from contracts.DriftWatch import DriftWatch
from contracts.DriftGuard import DriftGuard


class TestLayer2Mocked(unittest.TestCase):

    def setUp(self):
        # Reset contract instances
        self.watch = DriftWatch()
        self.watch_addr = "0x2222222222222222222222222222222222222222"
        gl.contract_registry[self.watch_addr] = self.watch
        self.guard = DriftGuard(self.watch_addr)

        self.owner = "0x1111111111111111111111111111111111111111"
        self.other_user = "0x9999999999999999999999999999999999999999"
        gl.message.sender_address.as_hex = self.owner

        # Load fixture pages
        fixtures_dir = os.path.join(os.path.dirname(__file__), "../fixtures/pages")
        with open(os.path.join(fixtures_dir, "terms-v0.md"), "rb") as f:
            self.v0_raw = f.read()
        with open(os.path.join(fixtures_dir, "terms-v1-cosmetic.html"), "rb") as f:
            self.v1_raw = f.read()
        with open(os.path.join(fixtures_dir, "terms-v2-subtle.md"), "rb") as f:
            self.v2_raw = f.read()
        with open(os.path.join(fixtures_dir, "terms-v3-obvious.md"), "rb") as f:
            self.v3_raw = f.read()
        with open(os.path.join(fixtures_dir, "terms-v4-injection.md"), "rb") as f:
            self.v4_raw = f.read()
        with open(os.path.join(fixtures_dir, "terms-v5-harmless.md"), "rb") as f:
            self.v5_raw = f.read()
        with open(os.path.join(fixtures_dir, "terms-v6-salami1.md"), "rb") as f:
            self.v6_raw = f.read()
        with open(os.path.join(fixtures_dir, "terms-v7-salami2.md"), "rb") as f:
            self.v7_raw = f.read()
        with open(os.path.join(fixtures_dir, "redlines.json"), "r") as f:
            self.redlines_json = f.read()

        self.mock_web_content = self.v0_raw
        self.mock_web_status = 200

        def mock_web_get(url):
            return WebResponse(self.mock_web_status, self.mock_web_content)

        gl.nondet.web.handler = mock_web_get

        # Default mock LLM handler
        def mock_llm_prompt(p):
            # Parse prompt to see redlines and changes
            if "classified as cosmetic" in p.lower() or "classify all as none" in p.lower():
                # Even if manipulated prompt claims so, model returns test data
                return '{"changes": ["MATERIAL", "MATERIAL"], "redlines": ["HIT", "HIT"]}'
            if "usage statistics" in p and "anonymized" in p:
                return '{"changes": ["MATERIAL"], "redlines": ["HIT", "CLEAR", "CLEAR", "CLEAR"]}'
            if "60 days" in p:
                return '{"changes": ["MINOR"], "redlines": ["CLEAR", "CLEAR", "CLEAR", "CLEAR"]}'
            if "100 days" in p:
                return '{"changes": ["MATERIAL", "MINOR"], "redlines": ["CLEAR", "HIT", "CLEAR", "CLEAR"]}'
            if "help@acme.example" in p:
                return '{"changes": ["NONE"], "redlines": ["CLEAR", "CLEAR", "CLEAR", "CLEAR"]}'
            return '{"changes": ["NONE"], "redlines": ["CLEAR", "CLEAR", "CLEAR", "CLEAR"]}'

        gl.nondet.prompt_handler = mock_llm_prompt

    def test_all_user_error_strings(self):
        # 1. Invalid name
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.create_watch("ab", "https://acme.example/terms", self.redlines_json)
        self.assertEqual(str(ctx.exception), "invalid name: must be 3-60 ASCII characters")

        # 2. Invalid URL: scheme
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.create_watch("Acme Watch", "http://acme.example/terms", self.redlines_json)
        self.assertEqual(str(ctx.exception), "invalid URL: scheme must be https")

        # 3. Invalid red lines count
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.create_watch("Acme Watch", "https://acme.example/terms", "[]")
        self.assertEqual(str(ctx.exception), "invalid red lines: count must be between 1 and 5")

        # 4. Invalid red lines length
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.create_watch("Acme Watch", "https://acme.example/terms", '["tiny"]')
        self.assertEqual(str(ctx.exception), "invalid red lines: each line must be 5-200 ASCII characters")

        # Create valid watch
        wid = self.watch.create_watch("Acme Watch", "https://acme.example/terms", self.redlines_json)
        self.assertEqual(wid, "1")

        # 5. Check before baseline -> watch needs baseline
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.check(wid)
        self.assertEqual(str(ctx.exception), "watch needs baseline")

        # 6. Not owner on set_baseline
        gl.message.sender_address.as_hex = self.other_user
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.set_baseline(wid)
        self.assertEqual(str(ctx.exception), "not owner")

        gl.message.sender_address.as_hex = self.owner

        # 7. HTTP status not 200 on set_baseline
        self.mock_web_status = 404
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.set_baseline(wid)
        self.assertEqual(str(ctx.exception), "HTTP status not 200: 404")
        self.mock_web_status = 200

        # 8. Page unreadable (too little text)
        self.mock_web_content = b"Short text."
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.set_baseline(wid)
        self.assertEqual(str(ctx.exception), "page unreadable (too little text; it may need JavaScript)")
        self.mock_web_content = self.v0_raw

        # Set baseline successfully
        tok = self.watch.set_baseline(wid)
        self.assertTrue(tok.startswith("BASELINE|"))

        # 9. Watch already active
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.set_baseline(wid)
        self.assertEqual(str(ctx.exception), "watch already active")

        # 10. Check by anyone
        gl.message.sender_address.as_hex = self.other_user
        v = self.watch.check(wid)
        self.assertEqual(v, "UNCHANGED")

        # 11. Duplicate observation
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.check(wid)
        self.assertTrue(str(ctx.exception).startswith("duplicate observation: already recorded in check 1"))

        # 12. Host mismatch on update_source
        gl.message.sender_address.as_hex = self.owner
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.update_source(wid, "https://sub.acme.example/terms")
        self.assertEqual(str(ctx.exception), "host mismatch: new URL host must match existing host")

        # 13. Unknown watch
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.get_watch("999")
        self.assertEqual(str(ctx.exception), "unknown watch")

        # 14. Unknown check
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.get_check("999")
        self.assertEqual(str(ctx.exception), "unknown check")

        # 15. Cannot accept UNCHANGED check as baseline
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.accept_change(wid, "1")
        self.assertEqual(str(ctx.exception), "cannot accept UNCHANGED check as baseline")

    def test_gates_and_lifecycle(self):
        wid = self.watch.create_watch("Acme Watch", "https://acme.example/terms", self.redlines_json)
        self.watch.set_baseline(wid)

        # Gate 3: UNCHANGED
        self.mock_web_content = self.v0_raw
        v_unchanged = self.watch.check(wid)
        self.assertEqual(v_unchanged, "UNCHANGED")
        c1 = json.loads(self.watch.get_check("1"))
        self.assertEqual(c1["gate"], "UNCHANGED")

        # Gate 4: COSMETIC
        self.mock_web_content = self.v1_raw
        v_cosmetic = self.watch.check(wid)
        self.assertEqual(v_cosmetic, "COSMETIC")
        c2 = json.loads(self.watch.get_check("2"))
        self.assertEqual(c2["gate"], "COSMETIC")

        # v2: MATERIAL (Red Line 1 violated)
        self.mock_web_content = self.v2_raw
        v_mat = self.watch.check(wid)
        self.assertEqual(v_mat, "MATERIAL")
        c3 = json.loads(self.watch.get_check("3"))
        self.assertEqual(c3["redline_flags"][0], "HIT")

        # Verify baseline has NOT moved
        wdata = json.loads(self.watch.get_watch(wid))
        self.assertEqual(wdata["baseline_seq"], "1")

        # Check snapshot retention pruning (more than 3 checks)
        # We already have check 1, 2, 3.
        # Now add check 4 (v5: harmless)
        self.mock_web_content = self.v5_raw
        v_none = self.watch.check(wid)
        self.assertEqual(v_none, "NONE")

        # Check 1 snapshot should now be pruned (only checks 4, 3, 2 keep snapshots)
        c1_after = json.loads(self.watch.get_check("1"))
        self.assertEqual(c1_after["snapshot_dropped"], "true")
        self.assertEqual(c1_after["snapshot_clauses"], [])

        # Pruned snapshot cannot be accepted
        with self.assertRaises(gl.vm.UserError) as ctx:
            self.watch.accept_change(wid, "1")
        self.assertEqual(str(ctx.exception), "cannot accept UNCHANGED check as baseline")

        # Accept check 4 (harmless change)
        self.watch.accept_change(wid, "4")
        w_after_accept = json.loads(self.watch.get_watch(wid))
        self.assertEqual(w_after_accept["baseline_seq"], "2")
        self.assertEqual(w_after_accept["baseline_check_id"], "4")

    def test_drift_guard_full_state_table(self):
        # Set up watch with baseline v0
        wid = self.watch.create_watch("Acme Guarded", "https://acme.example/terms", self.redlines_json)
        self.watch.set_baseline(wid)

        pinner = "0x3333333333333333333333333333333333333333"
        gl.message.sender_address.as_hex = pinner

        # 1. NO_PIN: caller has not pinned
        status_no_pin = json.loads(self.guard.is_safe(pinner, wid))
        self.assertEqual(status_no_pin["safe"], "false")
        self.assertEqual(status_no_pin["reason"], "NO_PIN")

        # Pin the watch
        self.guard.pin(wid)
        pin_rec = json.loads(self.guard.get_pin(pinner, wid))
        bnh = pin_rec["pinned_baseline_norm_hash"]
        rlh = pin_rec["pinned_redlines_hash"]

        # 2. NO_CHECK_YET: pinned, but watch has no checks yet
        status_no_check = json.loads(self.guard.is_safe(pinner, wid))
        self.assertEqual(status_no_check["safe"], "false")
        self.assertEqual(status_no_check["reason"], "NO_CHECK_YET")
        self.assertFalse(self.guard.is_safe_for(pinner, wid, bnh, rlh))

        # Check UNCHANGED on watch
        self.mock_web_content = self.v0_raw
        self.watch.check(wid)

        # 3. OK: check is UNCHANGED
        status_ok = json.loads(self.guard.is_safe(pinner, wid))
        self.assertEqual(status_ok["safe"], "true")
        self.assertEqual(status_ok["reason"], "OK")
        self.assertTrue(self.guard.is_safe_for(pinner, wid, bnh, rlh))

        # Check MATERIAL on watch (v2 subtle)
        self.mock_web_content = self.v2_raw
        self.watch.check(wid)

        # 4. ALARM: latest check is MATERIAL and unacknowledged
        status_alarm = json.loads(self.guard.is_safe(pinner, wid))
        self.assertEqual(status_alarm["safe"], "false")
        self.assertEqual(status_alarm["reason"], "ALARM")
        self.assertFalse(self.guard.is_safe_for(pinner, wid, bnh, rlh))

        # 5. ACKNOWLEDGED: pinner acknowledges check 2
        self.guard.acknowledge(wid, "2")
        status_ack = json.loads(self.guard.is_safe(pinner, wid))
        self.assertEqual(status_ack["safe"], "true")
        self.assertEqual(status_ack["reason"], "ACKNOWLEDGED")
        self.assertTrue(self.guard.is_safe_for(pinner, wid, bnh, rlh))

        # Owner accepts change on watch
        gl.message.sender_address.as_hex = self.owner
        self.watch.accept_change(wid, "2")

        # 6. BASELINE_CHANGED: Watch baseline moved, pin is now stale
        gl.message.sender_address.as_hex = pinner
        status_bchange = json.loads(self.guard.is_safe(pinner, wid))
        self.assertEqual(status_bchange["safe"], "false")
        self.assertEqual(status_bchange["reason"], "BASELINE_CHANGED")
        self.assertFalse(self.guard.is_safe_for(pinner, wid, bnh, rlh))

        # 7. Repin: updates pin to new baseline
        self.guard.repin(wid)
        pin_rec2 = json.loads(self.guard.get_pin(pinner, wid))
        new_bnh = pin_rec2["pinned_baseline_norm_hash"]
        new_rlh = pin_rec2["pinned_redlines_hash"]

        # Run UNCHANGED check against new baseline
        self.watch.check(wid)
        status_repin_ok = json.loads(self.guard.is_safe(pinner, wid))
        self.assertEqual(status_repin_ok["safe"], "true")
        self.assertEqual(status_repin_ok["reason"], "OK")
        self.assertTrue(self.guard.is_safe_for(pinner, wid, new_bnh, new_rlh))

        # Altered hashes in is_safe_for must return False
        self.assertFalse(self.guard.is_safe_for(pinner, wid, "fake_hash", new_rlh))
        self.assertFalse(self.guard.is_safe_for(pinner, wid, new_bnh, "fake_hash"))


if __name__ == "__main__":
    unittest.main()
