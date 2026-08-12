# Stoneage Interiors — Enquiry Manager V1

Node.js + JavaScript + Express + PostgreSQL Shopify app.

## What V1 does

- Receives the existing Stoneage enquiry form through a Shopify App Proxy.
- Verifies the App Proxy signature before accepting a public enquiry.
- Stores enquiries centrally in PostgreSQL.
- Generates a reference such as `SA-2026-123456`.
- Stores the original enquiry as the first inbound conversation message.
- Provides an embedded Shopify Admin dashboard.
- Lists/searches/filters enquiries.
- Shows the complete enquiry.
- Updates enquiry status.
- Adds internal notes.
- Uses Shopify's current App Bridge authentication for Admin API requests.
- Uses Shopify's current Node/Express app packages.

## What V1 intentionally does NOT do yet

- Send outbound email from the dashboard.
- Receive customer email replies.
- Attach files.
- Create/update Shopify Customer records.
- Automatic staff email notification.

Those belong in V2 after V1 is tested.

## Requirements

- Node.js 20+
- PostgreSQL 15+
- Shopify Partner/Dev Dashboard app
- A public HTTPS app URL for deployment
- A Shopify development store for testing

## 1. Install

```bash
npm install
```

Copy `.env.example` to `.env` and fill in:

```text
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SCOPES=read_customers
HOST=https://your-public-app-domain.example.com
PORT=3000
DATABASE_URL=postgres://username:password@host:5432/stoneage_enquiries
```

Never commit `.env`.

## 2. Create the database tables

```bash
npm run db:init
```

The Shopify PostgreSQL session adapter will create/manage its own session table.

## 3. Configure Shopify

Use Shopify CLI/Dev Dashboard to create the app.

Update `shopify.app.toml`:

- `client_id`
- `application_url`
- scopes
- app proxy configuration

For local development, Shopify CLI can update the development URLs automatically.

The app proxy is configured as:

```toml
[app_proxy]
url = "/proxy"
prefix = "apps"
subpath = "enquiries"
```

Therefore the storefront endpoint becomes:

```text
/apps/enquiries/submit
```

and Shopify forwards it to:

```text
https://YOUR_APP_DOMAIN/proxy/submit
```

## 4. Start

```bash
npm run dev
```

Then use Shopify CLI to run the app against your development store.

## 5. Connect the existing form

The uploaded form currently uses Shopify's native:

```liquid
{% form 'contact', id: 'enquiry-form' %}
```

For the new system, the form should POST to:

```text
/apps/enquiries/submit
```

and its JavaScript should submit the form with `fetch()`.

Keep the existing field names such as:

```text
contact[name]
contact[company]
contact[email]
contact[phone]
contact[country]
contact[how_discovered]
contact[profession]
contact[interested_in]
contact[body]
```

Also add a hidden honeypot:

```html
<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
```

The backend rejects non-empty honeypot submissions.

## 6. Form submission JavaScript

The existing theme script that collects the selected interests can remain.

The submission handler should use:

```javascript
const form = document.getElementById("enquiry-form");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const interests = Array.from(
    document.querySelectorAll("[data-pill]:checked")
  ).map((el) => el.value);

  document.getElementById("eq-interests-hidden").value =
    interests.join(", ");

  const response = await fetch("/apps/enquiries/submit", {
    method: "POST",
    body: new FormData(form)
  });

  const result = await response.json();

  if (!response.ok) {
    alert(result.error || "Unable to submit your enquiry.");
    return;
  }

  // Replace this with your existing success-message element.
  alert(`${result.message}\nReference: ${result.reference}`);

  form.reset();
});
```

Do NOT send the Shopify API secret to the storefront.

## 7. Admin dashboard

After the app is installed, open the app from Shopify Admin.

The App Home loads `public/admin.html`.

The frontend gets a fresh Shopify ID token using:

```javascript
const token = await window.shopify.idToken();
```

and sends:

```http
Authorization: Bearer <token>
```

to `/api/enquiries/*`.

The Express Shopify middleware validates the authenticated Admin request.

## 8. Database

The app creates:

- `enquiries`
- `messages`
- `internal_notes`

Shopify's session storage uses the same PostgreSQL database for Shopify authentication sessions.

## 9. V2

Once V1 is working, implement:

1. Transactional email provider.
2. Reply composer.
3. Outbound message storage.
4. Inbound email webhook.
5. Conversation threading.
6. Attachments.
7. Staff assignment.
8. Automatic notification emails.
9. Shopify Customer sync.
10. Follow-up dates.

Do not enable the live customer form until the V1 endpoint has been tested on a development store.

## Important security note

The public form endpoint is intentionally separate from the authenticated Admin API.

Never remove App Proxy signature verification and never expose Shopify API credentials in theme JavaScript.
