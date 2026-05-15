# mdt-whatsapp-dev — open-wa WhatsApp for concept testing

Rapid stand-in for the Twilio WhatsApp Business API while Business API
onboarding is pending. Lets `mdt-workers` send real follow-up messages
through a regular WhatsApp account driven by
[`@open-wa/wa-automate`](https://github.com/open-wa/wa-automate-nodejs).

> ⚠️ **Testing only.** This automates WhatsApp Web — there is no Meta
> approval, sends are rate-limit/ban-prone, and open-wa's licence restricts
> unlicensed/commercial use. Use a **throwaway test number**, not a clinic
> line. The Twilio path remains the production path; this is gated behind
> `WHATSAPP_PROVIDER=openwa` and changes nothing when unset.

## 1. Start the server

```bash
cd services/mdt-whatsapp-dev
docker compose -f docker-compose.openwa.yml up -d
docker compose -f docker-compose.openwa.yml logs -f
```

Scan the ASCII QR code printed in the logs with WhatsApp on the test phone
(Settings → Linked devices → Link a device). The session is persisted to
`./_session` (git-ignored), so you only scan once.

Swagger UI / health: <http://localhost:8002> (header `api_key: dev-secret`).

## 2. Point the workers at it

In `services/mdt-workers/.env`:

```bash
WHATSAPP_PROVIDER=openwa
OPENWA_API_URL=http://localhost:8002
OPENWA_API_KEY=dev-secret
```

(If the worker runs in its own container and open-wa runs via this compose,
use `http://host.docker.internal:8002` or a shared Docker network instead of
`localhost`.)

## 3. Trigger a send

The nightly Celery Beat job runs at 07:00, or fire it manually:

```bash
cd services/mdt-workers
celery -A mdt_workers.celery_app call mdt_workers.tasks.follow_up.scan_followups
```

Recipients come from `profiles.phone` for each task's assignee. The body is
plain text rendered locally — identical wording to the approved Twilio
templates, description capped, **no NHS numbers or full patient names**.

## How it maps to the Twilio path

| | Twilio (prod) | open-wa (test) |
|---|---|---|
| Approval | Meta-approved templates | none (WhatsApp Web) |
| Body | template + positional vars | local plain text, same wording |
| Recipient | `whatsapp:+E164` | `<digits>@c.us` |
| `provider_ref` | Twilio message SID | open-wa message id |
| Audit `metadata.provider` | `twilio` | `openwa` |

Switching back to production is just `WHATSAPP_PROVIDER=twilio` (or unset).

## Stop / reset

```bash
docker compose -f docker-compose.openwa.yml down      # stop
rm -rf _session                                       # forget the WA login
```
