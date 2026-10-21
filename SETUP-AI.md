# Switching on Meetbound AI

Meetbound AI is the subscription tool at `/ai`. The page works straight away in **preview mode**: every tool shows an example and the buttons say "Opening soon". To take real sign-ups and payments, connect three services. Allow about 1–2 hours, plus Razorpay's approval time.

| Service | What it does | Cost |
|---|---|---|
| Supabase | Accounts (email sign-in) and usage counts | Free tier is enough to start |
| Anthropic | The AI that writes the answers | Pay per use, well under ₹0.10 per answer with Claude Haiku 5.5 |
| Razorpay | Monthly subscriptions (UPI, cards, net banking) | About 2% per payment + GST; no monthly fee |

**Never paste keys into chat, email or code.** Add them only in Vercel's Environment Variables.

---

## Step 1: Supabase (accounts)

1. Go to **supabase.com**, sign up, and click **New project**. Name it `meetbound-ai`, choose the **Mumbai** region, and set a strong database password (save it in a password manager).
2. When it's ready, open **SQL Editor → New query**. Paste the whole of `supabase/schema.sql` from this repository and click **Run**. You should see "Success".
3. Open **Authentication → URL Configuration**:
   - **Site URL:** your live address, e.g. `https://meetbound-8nri.vercel.app`
   - **Redirect URLs:** add `https://meetbound-8nri.vercel.app/ai` and `https://*-juliet9.vercel.app/**` (for previews)
4. Open **Authentication → Emails** and edit the **Magic Link** template subject to "Your Meetbound AI sign-in link".
   - Supabase's built-in email sender is limited to a few emails an hour. Before launching publicly, set up your own sender under **Authentication → SMTP Settings**. Resend, Brevo and Zoho all have free plans.
5. Open **Project Settings → API** and keep this page open for Step 4. You need the **Project URL**, the **anon public** key and the **service_role** key. The service_role key is secret.

## Step 2: Anthropic (the AI)

1. Go to **console.anthropic.com** and sign up.
2. Under **Billing**, add a card and buy a small amount of credit, e.g. $10. That covers well over 10,000 answers on Claude Haiku 5.5.
3. Under **API Keys**, click **Create Key**, name it `meetbound-ai`, and copy it. You only see it once.
4. Optional: under **Limits**, set a monthly spend limit, e.g. $20, so costs can never run away.

## Step 3: Razorpay (payments)

1. Go to **razorpay.com** and sign up. Complete **KYC**: PAN, bank account and business details. As a sole proprietor you can use your own PAN.
2. Razorpay checks your website before activating. Your site has the pages they look for:
   - `/terms`
   - `/privacy`
   - `/refunds` (cancellation and refunds)
   - `/contact`

   Some reviewers also ask for a business address and phone number on the contact page. Tell me and I'll add them.
3. Ask Razorpay to enable **Subscriptions** on your account. It's in the dashboard under **Subscriptions**, or ask their support.
4. In **Subscriptions → Plans**, create three plans. Copy each **Plan ID** (it starts with `plan_`).

   | Plan name | Billing | Amount |
   |---|---|---|
   | Meetbound AI Starter | Every 1 month | ₹199 |
   | Meetbound AI Pro | Every 1 month | ₹299 |
   | Meetbound AI Power | Every 1 month | ₹399 |

5. In **Account & Settings → API Keys**, generate keys. Copy the **Key ID** and **Key Secret**.
   - Start in **Test mode** to try everything without real money. Switch to **Live mode** keys when you're ready.
6. In **Account & Settings → Webhooks**, click **Add new webhook**:
   - **URL:** `https://meetbound-8nri.vercel.app/api/razorpay-webhook`
   - **Secret:** make up a long random password and save it.
   - **Events:** tick `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`, `subscription.completed`, `subscription.paused`, `subscription.pending`.

   Test mode and live mode each have their own webhooks. Set one up in each.

## Step 4: Add the keys to Vercel

Open **vercel.com → meetbound-8nri → Settings → Environment Variables**. Add each of these for **Production** and **Preview**:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (secret) |
| `ANTHROPIC_API_KEY` | Your Anthropic key (secret) |
| `RAZORPAY_KEY_ID` | Razorpay Key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay Key Secret (secret) |
| `RAZORPAY_WEBHOOK_SECRET` | The webhook secret you made up |
| `RAZORPAY_PLAN_199` | Plan ID for Starter |
| `RAZORPAY_PLAN_299` | Plan ID for Pro |
| `RAZORPAY_PLAN_399` | Plan ID for Power |
| `CLAUDE_MODEL` (optional) | Leave unset to use `claude-haiku-5-5` |

Then open **Deployments**, click the **⋯** on the latest deployment, and choose **Redeploy**.

## Step 5: Test before launch

Use Razorpay **test mode** keys first.

1. Open `/ai` and sign in with your email. Click the link in the email.
2. Use the 3 free answers. Check that the counter goes 3 → 2 → 1 → 0 and that the 4th attempt shows "You've used all your answers".
3. Choose **Starter** and pay with a Razorpay test card or test UPI ID (see Razorpay's "Test card details" docs). The counter should show 50 answers.
4. Click **Cancel renewal**. The plan should show "Ends [date]".
5. In Supabase, open **Table Editor → profiles** to see your account.

When everything works, swap in the **live** Razorpay keys, add the live-mode webhook, and redeploy.

---

## How the money works

| Plan | Price | Razorpay fee (~2% + GST) | AI cost if every answer is used* | Approximate margin |
|---|---|---|---|---|
| Starter | ₹199 | ~₹5 | ~₹3 | ~₹190 |
| Pro | ₹299 | ~₹7 | ~₹8 | ~₹284 |
| Power | ₹399 | ~₹9 | ~₹20 | ~₹370 |

\*Assumes Claude Haiku 5.5 at its published price ($0.10 per million input tokens and $0.50 per million output tokens for normal-length prompts), about 2,000 tokens per answer, and ₹85 to the dollar. Most subscribers won't use every answer. Check current prices at platform.claude.com/docs/en/about-claude/pricing.

**Tax:** if your turnover passes the GST threshold, you'll need GST registration and to charge GST. Ask a CA how to set up Meetbound AI income for tax.
