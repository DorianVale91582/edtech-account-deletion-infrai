import assert from "node:assert/strict";
import { buildDeletionRecord, deletionRequest } from "../src/account-deletion.ts";

const input = deletionRequest.parse({
  userId: "learner-7",
  credentialId: "key-7",
  courses: [{ courseId: "algebra", deadline: "2027-02-01T12:00:00.000Z" }],
  educatorReportIds: ["progress-7"]
});

const record = buildDeletionRecord(input, ["session-a", "session-b"]);
assert.deepEqual(record, {
  userId: "learner-7",
  revokedSessionIds: ["session-a", "session-b"],
  credentialId: "key-7",
  courseDeadlines: [{ courseId: "algebra", deadline: "2027-02-01T12:00:00.000Z" }],
  educatorReportIds: ["progress-7"],
  status: "deleted"
});
console.log("account deletion decision: passed");
