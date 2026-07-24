# Implementation Plan

## Goal
Add MongoDB Atlas connectivity and scheduled Reservo reminder webhooks for appointments.

## Scope
- Keep credentials in environment variables only.
- Reuse the existing Express app and Mongo connection flow.
- Add a small scheduling layer that can survive restarts.

## Phase 1: Environment and config
- Add `RESERVO_TOKEN` and any Reservo endpoint URLs to `.env.example`.
- Keep `DB_URI`, `JWT_SECRET`, and `SLACK_ERROR_WEBHOOK` in env vars.
- Decide and document the app timezone used for reminder calculations.

## Phase 2: Data model
- Add a collection for appointments or reminder jobs.
- Store appointment datetime, timezone, contact data, and reminder status.
- Persist one record per reminder step so sends are idempotent.

## Phase 3: Reminder scheduler
- On startup, load pending reminders from Mongo.
- Schedule three send windows per appointment:
  - 9:00 AM the day before the appointment.
  - 10 hours after the first reminder.
  - 1 hour before the appointment.
- Recompute schedules after restarts from persisted data.

## Phase 4: Webhook delivery
- Build a service that posts to Reservo's webhook/API with the token.
- Log success and failure per reminder step.
- Retry transient failures without duplicating already-sent reminders.

## Phase 5: Operational safety
- Reject missing or invalid env vars at boot.
- Keep Slack alerts for 5xx errors.
- Add a simple health endpoint check before enabling scheduling.

## Phase 6: Verification
- Validate with a test appointment in the past/future.
- Confirm timezone handling.
- Confirm reminders fire once each and survive restart.
