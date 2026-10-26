import { z } from "zod";
import { InfraiClient, infrai } from "./infrai.ts";

export const deletionRequest = z.object({
  userId: z.string().min(1),
  credentialId: z.string().min(1),
  courses: z.array(z.object({ courseId: z.string(), deadline: z.string().datetime() })),
  educatorReportIds: z.array(z.string())
});

export type DeletionRequest = z.infer<typeof deletionRequest>;

export function buildDeletionRecord(input: DeletionRequest, revokedSessionIds: string[]) {
  return {
    userId: input.userId,
    revokedSessionIds,
    credentialId: input.credentialId,
    courseDeadlines: input.courses.map(({ courseId, deadline }) => ({ courseId, deadline })),
    educatorReportIds: input.educatorReportIds,
    status: "deleted"
  } as const;
}

export async function deleteLearnerAccount(input: unknown, client: InfraiClient) {
  const request = deletionRequest.parse(input);
  const sessions = await client.listSessions(request.userId);
  for (const session of sessions) await client.revokeSession(session.session_id);
  await client.revokeAccountKey(request.credentialId);
  return buildDeletionRecord(request, sessions.map(({ session_id }) => session_id));
}

export async function main() {
  const request = deletionRequest.parse({
    userId: process.env.EDTECH_USER_ID ?? "learner-42",
    credentialId: process.env.EDTECH_CREDENTIAL_ID ?? "credential-id",
    courses: [{ courseId: "course-typescript", deadline: "2027-01-15T17:00:00.000Z" }],
    educatorReportIds: ["report-progress-42"]
  });
  const result = await deleteLearnerAccount(request, new InfraiClient());
  console.log(JSON.stringify(result, null, 2));
  console.log(`using ${infrai.auth.session.list_for_user}, ${infrai.auth.session.revoke}, and ${infrai.account.keys.revoke}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
