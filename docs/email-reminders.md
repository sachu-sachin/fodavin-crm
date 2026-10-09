# Daily reminder emails

Every morning at **08:30 IST**, each employee gets **one** email listing what
needs them today. People with nothing due get no email. Each section appears
only when it has something in it:

| Section | Who gets it | What's in it |
|---|---|---|
| Your tasks | The assignee | Tasks overdue or due today, including meeting action items and onboarding steps |
| Today's meetings | Attendees | Meetings starting today, with the time and client or location |
| Follow-ups to chase | People with *Add, edit and move inquiries* | Open inquiries whose next follow-up is today or overdue |
| Social posts | The assignee | Unpublished posts scheduled for today, or whose reminder time has come |
| Policies to acknowledge | Everyone in the audience | Live announcements needing acknowledgement that they haven't confirmed |

Every item links straight to the right page. Anyone can turn their own email
off (or back on) from the menu under their name → **Daily reminder email**.

## How it works

- A scheduled GitHub Action (`.github/workflows/reminders.yml`) calls
  `POST /api/cron/reminders` on the app, sending the `CRON_SECRET`. Nothing
  depends on where the app is hosted (Vercel or your VPS).
- That endpoint isn't behind login; the secret is the only way in, compared
  in constant time. Without `CRON_SECRET` set, it refuses everything.
- Each person's day is recorded in `digest_log` **before** their email is
  sent, so a scheduler that fires twice can't email anyone twice. If sending
  fails, the record is removed again so a re-run retries, and the run turns
  red in **Actions**.
- `?dry=1` sends nothing and returns who would get what. Manual runs from the
  Actions tab are dry by default.

## Setup

### 1. An email account to send from

Use a real mailbox on your domain, e.g. `os@fodavin.com`, so the mail isn't
treated as spam. Any SMTP provider works:

| Provider | Host | Port | Password |
|---|---|---|---|
| **Zoho Mail** (India accounts) | `smtp.zoho.in` | 587 | An **app-specific password** (Zoho → My Account → Security) |
| Zoho Mail (global accounts) | `smtp.zoho.com` | 587 | Same as above |
| Google Workspace | `smtp.gmail.com` | 587 | An **app password** (needs 2-Step Verification) |
| Brevo / Resend | as shown in their dashboard | 587 | Their SMTP key |

Your domain's SPF/DKIM records should include the provider. Zoho and Google
show the exact DNS records to add.

### 2. Settings on the app server

Add these to the **production** env file (`.env.local` on the VPS, or the
Vercel project's environment variables), then restart or redeploy:

```
SMTP_HOST=smtp.zoho.in
SMTP_PORT=587
SMTP_USER=os@fodavin.com
SMTP_PASS=<app-specific password>
SMTP_FROM="Fodavin OS <os@fodavin.com>"
CRON_SECRET=<output of: openssl rand -base64 32>
```

`APP_URL` must already be set. The links in the email use it.

### 3. Database

This feature adds `profiles.email_digest` and the `digest_log` table. As with
any schema change: `npm run db:push`, then `npm run db:setup`, before the new
code runs.

### 4. The schedule

GitHub → the repo → **Settings → Secrets and variables → Actions**, and add:

| Name | Value |
|---|---|
| `REMINDERS_APP_URL` | The app's public address, e.g. `https://os.fodavin.com` |
| `CRON_SECRET` | Exactly the same value as on the server |

Until both are set, the workflow just notes that reminders aren't set up and
stays green.

### 5. Try it

1. **Actions → Daily reminders → Run workflow**, with *Preview only* ticked.
   The log shows who would get an email and what's in it; nothing is sent.
2. Run it again with *Preview only* unticked to send for real (today's emails,
   once per person per day).

From then on it runs every morning on its own.

## Running it from somewhere else

Any scheduler can do the same call, e.g. cron on the VPS instead of GitHub:

```bash
# /etc/cron.d/fodavin-reminders: 03:00 UTC = 08:30 IST
0 3 * * * fodavin curl -fsS -X POST -H "Authorization: Bearer $(cat /srv/fodavin/cron-secret)" https://os.fodavin.com/api/cron/reminders > /dev/null
```

Use one scheduler, not both. Even with both, nobody gets two emails; the
second run just finds everyone already sent.

## Troubleshooting

- **401 Not authorized:** the `CRON_SECRET` in GitHub doesn't match the
  server's.
- **503 "Reminders aren't set up":** `CRON_SECRET`, `APP_URL` or an `SMTP_*`
  setting is missing on the server.
- **502 with `failures`:** the mail provider refused. The message says why,
  e.g. a wrong password, or a "from" address the account isn't allowed to send
  as. Fix it and re-run; only the people whose emails failed are retried.
