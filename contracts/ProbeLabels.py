# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *


class ProbeLabels(gl.Contract):
    results: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.view
    def get_result(self, key: str) -> str:
        if key in self.results:
            return self.results[key]
        return ""

    @gl.public.write
    def probe_prompt(self, prompt_json_str: str, result_key: str) -> None:
        def leader_fn() -> str:
            raw = gl.nondet.exec_prompt(prompt_json_str)
            if not isinstance(raw, str):
                raw = str(raw)
            # ASCII clean and cap to 1500
            try:
                raw_ascii = raw.encode("ascii", "replace").decode("ascii")
            except Exception:
                raw_ascii = str(raw)
            return raw_ascii[:1500]

        def validator_fn(leader_res) -> bool:
            return True

        decision = gl.vm.run_nondet(leader_fn, validator_fn)
        self.results[result_key] = decision
