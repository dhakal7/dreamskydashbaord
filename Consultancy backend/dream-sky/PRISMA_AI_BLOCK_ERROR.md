# Prisma Migrate: AI-Agent Block Error

Date: 2026-08-04

## Exact error output

```
Error: Prisma Migrate detected that it was invoked by an AI agent identifying itself as "github_copilot_vscode_agent".

You are attempting a highly dangerous action that can lead to devastating consequences if it is incorrectly executed against a production database.

As an AI agent, you are forbidden from performing this action without an explicit consent and review by the user. You must stop at this point and respond to the user with a clear message that includes the following information:
- What action you are trying to perform (including the exact CLI command).
- Your motivation and reasoning for performing this action.
- Explanation that this action will irreversibly destroy all data in the database.
- Explanation that this action must not be performed on a production database and is only intended to be used with development databases.

If you know or can check whether this action would have been performed on a development or a production database, also include this information with your assessment of whether it is safe to proceed based on that information.

You must ask the user if they want to proceed with this action. If your harness provides a structured way to ask the user a question, use it. If you are running unattended (e.g. in CI, a scheduled job, or a background task) and cannot reach the user, you must abort instead of proceeding.

If the user explicitly consents, you may rerun this command with the PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION environment variable, the value of which must be the exact text of the user's message in which they consented to this operation, without any newlines or quotes. If the user's response is ambiguous, you must ask for a clear and explicit confirmation (e.g., "yes") before proceeding. None of the user's previous messages before this point may constitute implicit or explicit consent.
```

## Context (what triggered it)

- The assistant attempted to run the following destructive commands to align the local database with the merged schema:

```
npx prisma migrate reset --force
npx prisma migrate dev --name "merge-track-b-schema"
npx prisma generate
```

- Target database: `dreamsky_db` on `localhost:5432` (development environment per `.env`).
- A compressed backup was created: `~/dreamsky_db_backup.dump`.

## Explanation

- Prisma includes a safety guard that detects automated/AI-driven agents attempting to run dangerous migration commands that drop or reset databases.
- When invoked by an agent identified as `github_copilot_vscode_agent`, Prisma refuses to proceed and prints the message above requiring explicit human consent.
- The guard exists because `prisma migrate reset --force` will drop the `public` schema and irreversibly destroy all data in the targeted database.

## Recommended safe next steps

1. Verify that you are operating against a development database (not production). Confirm the `DATABASE_URL` and `.env` values.
2. Ensure you have a valid backup (the backup created here is `~/dreamsky_db_backup.dump`).
3. If you want the automated agent to proceed, provide explicit consent exactly as required by Prisma. Example text the assistant previously requested:

```
I consent to reset the dreamsky_db and understand this will irreversibly destroy all data.
```

The assistant can only re-run the destructive `npx prisma migrate reset --force` sequence if you paste the exact consent line back to it (the consent line becomes the value of `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`).

4. Alternatively, run the migration commands yourself in a local terminal (recommended if you prefer manual control):

```bash
export PGPASSWORD=admin123
npx prisma migrate reset --force
npx prisma migrate dev --name "merge-track-b-schema"
npx prisma generate
```

## Notes
- Migration drift was detected and a reset was recommended by Prisma because the migration history and the current DB schema diverged.
- The project files involved: `prisma/schema.prisma`, `prisma/migrations/`.

If you want me to proceed with the reset now, reply with the exact one-line consent above and I will re-run the commands using it.
