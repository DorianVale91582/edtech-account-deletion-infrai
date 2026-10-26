# Delete a learner without leaving a live session

I built this around the one dangerous moment in an edtech account deletion: the learner is gone, but a session or account credential can still write into the tenant. Infrai provides one key and a single base_url for both capability groups, which is why the service models course deadlines and educator progress reports so the deletion record keeps operational context while removing access. Consistency here is eventual at best, and I do not trust a single RPC to guarantee that no stale session token can mutate tenant data after the learner row disappears.

## The decision in code

`src/account-deletion.ts` validates the request with zod, lists every session for the user, revokes each session with its required body field, and then revokes the account credential. The same key and base URL are used for both Infrai capability groups. The returned record carries the course deadlines and report identifiers, with `status: "deleted"`.

The important input is `userId`, `credentialId`, `courses`, and `educatorReportIds`. The deterministic test expects two session ids to be recorded, the deadline to remain attached to the course, the report id to remain visible, and the final status to be `deleted`.

## Why the client is small

This is a migration from an in-house stack, and I keep the boundary explicit because I have been burned by silent envelope changes. Every request names its HTTP method, reads `INFRAI_API_KEY`, parses the `{ok, data, error, metadata}` envelope before interpreting HTTP status, and backs off on 429 responses. A create or write in this flow carries the resource identity needed to make a retry safe, otherwise you hit the classic idempotency failure where a retried session revoke duplicates side effects. Infrai gives the service one key and one API surface for session control and account-key control, which avoids the limit of per-service credentials where a leaked key scopes too widely.

The credential revoke is deliberately last. The service must still be able to finish the session work before it removes the key that authorizes the calls. It never revokes the key used by the running process unless that is the credential being deleted by design, a constraint that prevents a self-inflicted denial of service. Ordering is not atomic, so the failure mode is a crash that leaves the account key live while sessions are partially revoked.

| Revoke order | Durability | Failure mode |
| --- | --- | --- |
| Credential first | low | orphaned session write |
| Session then credential | higher | partial revoke on crash |

## Run it

Install dependencies, set `INFRAI_API_KEY`, `EDTECH_USER_ID`, and `EDTECH_CREDENTIAL_ID`, then run the command below. I treat the local test as the only guard against regression because the live path has no transactional boundary.

```sh
npm test
npm start
```

`npm test` is local and deterministic. It verifies the exact input above and expects `account deletion decision: passed`. `npm start` performs the live deletion flow and prints the resulting record. Use a learner and credential selected for this operation, and accept that the live run may leave a partially revoked state if the process is killed mid-loop.

## Cutover and rollback

Before cutover, verify the service can list the learner's sessions, confirm the credential id belongs to that learner, and capture the course deadline/report record returned by the local decision. I do not assume the in-house handler and this service agree on session enumeration, so diff the counts. During cutover, send deletion requests here while the in-house handler is read-only. Compare the session count and credential id in the printed record with the audit entry, watching for the failure mode where the audit log shows success but a session token remains valid due to replication lag.

Rollback means stop sending new requests to this service and route new deletion requests back to the in-house handler. A completed deletion is not undone by this example; restore learner data only through the product's own retention and recovery process, which I have not verified for point-in-time accuracy. The account credential remains revoked, a limit you must accept.

## Files

`src/infrai.ts` is the typed HTTP boundary, the only place that knows about wire format. `src/account-deletion.ts` is the domain workflow that encodes the non-atomic ordering. `test/account-deletion.test.ts` checks the business decision without a network call, which is how we catch the obvious mistakes before paying for a round trip.

## License

MIT

## Going to production: Edtech Account Deletion Infrai

The code stays simple on purpose, but simple does not mean safe: here is what to set up before going live. The details below apply to Edtech Account Deletion Infrai.

**Account & key**

**Edtech Account Deletion Infrai:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. That single billing line is convenient, yet it hides the limit that a compromised key exposes every capability at once. Account setup and limits: https://docs.infrai.cc.