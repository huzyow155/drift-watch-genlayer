# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *


class DriftGuard(gl.Contract):
    watch_address: Address
    pins: TreeMap[str, str]
    pinner_watches: TreeMap[str, str]

    def __init__(self, watch_address_str: str):
        # Do not assign TreeMap() in __init__
        self.watch_address = Address(watch_address_str)

    # -----------------------------------------------------------------------
    # Public Views
    # -----------------------------------------------------------------------

    @gl.public.view
    def get_pin(self, pinner: str, watch_id: str) -> str:
        pkey = f"{pinner.strip().lower()}|{str(watch_id).strip()}"
        if pkey in self.pins:
            return self.pins[pkey]
        return ""

    @gl.public.view
    def list_pins(self, pinner: str, limit: int = 10) -> list[str]:
        if limit <= 0:
            limit = 10
        if limit > 20:
            limit = 20
        pkey_list = pinner.strip().lower()
        if pkey_list not in self.pinner_watches:
            return []
        wids = json.loads(self.pinner_watches[pkey_list])
        results = []
        for wid in wids[:limit]:
            k = f"{pkey_list}|{wid}"
            if k in self.pins:
                results.append(self.pins[k])
        return results

    @gl.public.view
    def is_safe(self, pinner: str, watch_id: str) -> str:
        p_addr = pinner.strip().lower()
        wid = str(watch_id).strip()
        pkey = f"{p_addr}|{wid}"

        if pkey not in self.pins:
            res = {
                "safe": "false",
                "reason": "NO_PIN",
                "latest_check_id": "",
                "latest_verdict": "",
            }
            return json.dumps(res, sort_keys=True, separators=(",", ":"))

        pin_data = json.loads(self.pins[pkey])
        pinned_bnh = pin_data.get("pinned_baseline_norm_hash", "")
        pinned_rlh = pin_data.get("pinned_redlines_hash", "")
        ack_cid_str = pin_data.get("acknowledged_check_id", "0")
        try:
            ack_cid = int(ack_cid_str)
        except Exception:
            ack_cid = 0

        # Synchronous cross-contract view call to DriftWatch.get_status
        watch_contract = gl.get_contract_at(self.watch_address)
        status_json = watch_contract.view().get_status(wid)
        status_data = json.loads(status_json)

        curr_bnh = status_data.get("baseline_norm_hash", "")
        curr_rlh = status_data.get("redlines_hash", "")
        latest_cid_str = status_data.get("latest_check_id", "")
        latest_verdict = status_data.get("latest_verdict", "")

        # 1. Baseline changed
        if curr_bnh != pinned_bnh:
            res = {
                "safe": "false",
                "reason": "BASELINE_CHANGED",
                "latest_check_id": latest_cid_str,
                "latest_verdict": latest_verdict,
            }
            return json.dumps(res, sort_keys=True, separators=(",", ":"))

        # 2. Red lines changed
        if curr_rlh != pinned_rlh:
            res = {
                "safe": "false",
                "reason": "REDLINES_CHANGED",
                "latest_check_id": latest_cid_str,
                "latest_verdict": latest_verdict,
            }
            return json.dumps(res, sort_keys=True, separators=(",", ":"))

        # 3. No check yet
        if not latest_cid_str or latest_cid_str == "0":
            res = {
                "safe": "false",
                "reason": "NO_CHECK_YET",
                "latest_check_id": "",
                "latest_verdict": "",
            }
            return json.dumps(res, sort_keys=True, separators=(",", ":"))

        try:
            latest_cid = int(latest_cid_str)
        except Exception:
            latest_cid = 0

        # 4. Check alarm
        if latest_verdict in ("MATERIAL", "REVIEW"):
            if latest_cid > ack_cid:
                res = {
                    "safe": "false",
                    "reason": "ALARM",
                    "latest_check_id": latest_cid_str,
                    "latest_verdict": latest_verdict,
                }
                return json.dumps(res, sort_keys=True, separators=(",", ":"))
            else:
                res = {
                    "safe": "true",
                    "reason": "ACKNOWLEDGED",
                    "latest_check_id": latest_cid_str,
                    "latest_verdict": latest_verdict,
                }
                return json.dumps(res, sort_keys=True, separators=(",", ":"))

        # 5. Safe: UNCHANGED, COSMETIC, NONE, MINOR
        res = {
            "safe": "true",
            "reason": "OK",
            "latest_check_id": latest_cid_str,
            "latest_verdict": latest_verdict,
        }
        return json.dumps(res, sort_keys=True, separators=(",", ":"))

    @gl.public.view
    def is_safe_for(
        self,
        pinner: str,
        watch_id: str,
        pinned_baseline_norm_hash: str,
        pinned_redlines_hash: str,
    ) -> bool:
        p_addr = pinner.strip().lower()
        wid = str(watch_id).strip()
        pkey = f"{p_addr}|{wid}"

        if pkey not in self.pins:
            return False

        pin_data = json.loads(self.pins[pkey])
        if pin_data.get("pinned_baseline_norm_hash") != pinned_baseline_norm_hash:
            return False
        if pin_data.get("pinned_redlines_hash") != pinned_redlines_hash:
            return False

        safe_eval_str = self.is_safe(pinner, watch_id)
        safe_eval = json.loads(safe_eval_str)
        return safe_eval.get("safe") == "true"

    # -----------------------------------------------------------------------
    # Public Writes
    # -----------------------------------------------------------------------

    @gl.public.write
    def pin(self, watch_id: str) -> None:
        pinner = gl.message.sender_address.as_hex.lower()
        wid = str(watch_id).strip()

        # Synchronous view call to DriftWatch
        watch_contract = gl.get_contract_at(self.watch_address)
        status_json = watch_contract.view().get_status(wid)
        status_data = json.loads(status_json)

        if status_data.get("status") != "ACTIVE":
            raise gl.vm.UserError("watch is not active")

        pkey = f"{pinner}|{wid}"
        pin_record = {
            "schema_version": "1",
            "pinner": pinner,
            "watch_id": wid,
            "pinned_baseline_norm_hash": status_data.get("baseline_norm_hash", ""),
            "pinned_redlines_hash": status_data.get("redlines_hash", ""),
            "pinned_baseline_seq": status_data.get("baseline_seq", "1"),
            "acknowledged_check_id": "0",
        }
        self.pins[pkey] = json.dumps(pin_record, sort_keys=True, separators=(",", ":"))

        # Maintain index of pinned watches for pinner
        wlist = json.loads(self.pinner_watches.get(pinner, "[]"))
        if wid not in wlist:
            wlist.insert(0, wid)
            self.pinner_watches[pinner] = json.dumps(wlist[:50], sort_keys=True, separators=(",", ":"))

    @gl.public.write
    def acknowledge(self, watch_id: str, check_id: str) -> None:
        pinner = gl.message.sender_address.as_hex.lower()
        wid = str(watch_id).strip()
        cid = str(check_id).strip()
        pkey = f"{pinner}|{wid}"

        if pkey not in self.pins:
            raise gl.vm.UserError("no pin found for caller")

        # Verify that check belongs to this watch via DriftWatch
        watch_contract = gl.get_contract_at(self.watch_address)
        check_json = watch_contract.view().get_check(cid)
        check_data = json.loads(check_json)

        if check_data.get("watch_id") != wid:
            raise gl.vm.UserError("check does not belong to this watch")

        pin_record = json.loads(self.pins[pkey])
        pin_record["acknowledged_check_id"] = cid
        self.pins[pkey] = json.dumps(pin_record, sort_keys=True, separators=(",", ":"))

    @gl.public.write
    def repin(self, watch_id: str) -> None:
        pinner = gl.message.sender_address.as_hex.lower()
        wid = str(watch_id).strip()
        pkey = f"{pinner}|{wid}"

        if pkey not in self.pins:
            raise gl.vm.UserError("no pin found for caller")

        watch_contract = gl.get_contract_at(self.watch_address)
        status_json = watch_contract.view().get_status(wid)
        status_data = json.loads(status_json)

        if status_data.get("status") != "ACTIVE":
            raise gl.vm.UserError("watch is not active")

        pin_record = {
            "schema_version": "1",
            "pinner": pinner,
            "watch_id": wid,
            "pinned_baseline_norm_hash": status_data.get("baseline_norm_hash", ""),
            "pinned_redlines_hash": status_data.get("redlines_hash", ""),
            "pinned_baseline_seq": status_data.get("baseline_seq", "1"),
            "acknowledged_check_id": "0",
        }
        self.pins[pkey] = json.dumps(pin_record, sort_keys=True, separators=(",", ":"))
