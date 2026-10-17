# Error Codes and UserError Catalog

Status: Preview (Studionet)

This document catalogs every user-facing failure condition implemented in `DriftWatch` and `DriftGuard`. Every error is raised as a distinct, specific `gl.vm.UserError`.

## DriftWatch UserErrors

| Failure Condition | Exact UserError Message String | Trigger Description |
| :--- | :--- | :--- |
| Unknown watch lookup | `unknown watch` | Provided `watch_id` does not exist in `self.watches`. |
| Unknown check lookup | `unknown check` | Provided `check_id` does not exist in `self.checks`. |
| Unauthorized access | `not owner` | Caller is not the registered owner of the watch on owner-only methods (`set_baseline`, `accept_change`, `update_source`). |
| Inactive watch check | `watch needs baseline` | Attempting to call `check` on a watch whose status is `NEEDS_BASELINE`. |
| Redundant baseline setup | `watch already active` | Attempting to call `set_baseline` on a watch that has already transitioned to `ACTIVE`. |
| Invalid name | `invalid name: must be 3-60 ASCII characters` | Watch name has fewer than 3 characters, more than 60 characters, or contains non-ASCII characters. |
| URL scheme non-https | `invalid URL: scheme must be https` | URL scheme is not `https` (e.g., `http://`, `ftp://`). |
| URL length limit | `invalid URL: length exceeds 300 characters` | Watch target URL string length > 300 characters. |
| URL userinfo presence | `invalid URL: userinfo not allowed` | URL contains username/password credentials (e.g. `https://user:pass@host/`). |
| URL invalid port | `invalid URL: port must be empty or 443` | URL explicitly specifies a port other than standard HTTPS 443 (e.g., `:8080`, `:80`). |
| URL fragment presence | `invalid URL: fragment not allowed` | URL contains a URI fragment (e.g., `#section1`). |
| URL IP literal forbidden | `invalid URL: IP literals not allowed` | URL hostname is an IPv4 or IPv6 literal rather than a public domain name. |
| URL invalid host | `invalid URL: invalid host` | Hostname is missing, empty, or resolves to `localhost`, `.local`, or `.internal`. |
| Red lines format | `invalid red lines: invalid JSON array` | `red_lines_json` fails to parse as a valid JSON array of strings. |
| Red lines count | `invalid red lines: count must be between 1 and 5` | Number of red lines is 0 or greater than 5. |
| Red lines length | `invalid red lines: each line must be 5-200 ASCII characters` | An individual red line string is shorter than 5 characters, longer than 200 characters, or non-ASCII. |
| Host mismatch on update | `host mismatch: new URL host must match existing host` | Calling `update_source` with a URL whose parsed lowercase host differs from the stored host. |
| Non-200 HTTP response | `HTTP status not 200: <status>` | Web fetch returns an HTTP status code other than 200 (e.g., `HTTP status not 200: 404`). |
| Page size overflow | `page too large` | Fetched raw page payload exceeds 400,000 bytes. |
| Page unreadable | `page unreadable (too little text; it may need JavaScript)` | Cleaned page text is under 200 characters, or 0 clauses could be extracted (e.g. empty or SPA markup). |
| Duplicate observation | `duplicate observation: already recorded in check <check_id>` | Calling `check` with a document state that has already been evaluated against the same baseline. |
| Check mismatch on accept | `check does not belong to this watch` | Calling `accept_change` with a `check_id` that belongs to a different watch. |
| Unchanged check accept | `cannot accept UNCHANGED check as baseline` | Calling `accept_change` on a check whose recorded verdict is `UNCHANGED`. |
| Pruned snapshot accept | `snapshot clauses no longer stored for this check` | Calling `accept_change` on an older check whose `snapshot_clauses` were pruned beyond retention of 3. |

## DriftGuard UserErrors

| Failure Condition | Exact UserError Message String | Trigger Description |
| :--- | :--- | :--- |
| Watch inactive | `watch is not active` | Attempting to pin a watch whose status is not `ACTIVE`. |
| Missing pin | `no pin found for caller` | Calling `acknowledge` or `repin` without an existing pin. |
| Check mismatch on ack | `check does not belong to this watch` | Calling `acknowledge` with a check ID that is not linked to the pinned watch. |
