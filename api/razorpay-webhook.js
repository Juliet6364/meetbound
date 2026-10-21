// POST /api/razorpay-webhook: Razorpay tells us about renewals, cancellations and failed payments.
const { ENV, send, fail, readRaw, rpc, hmacHex, safeEqual, planFromRazorpayId } = require("../lib/server");
module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  if (!ENV.rzpWebhookSecret) return fail(res, 503, "not_configured", "Webhook secret not set.");
  const raw = await readRaw(req);
  if (!safeEqual(hmacHex(ENV.rzpWebhookSecret, raw), req.headers["x-razorpay-signature"])) return fail(res, 400, "bad_signature", "Invalid signature.");
  let evt;
  try { evt = JSON.parse(raw); } catch { return fail(res, 400, "bad_json", "Invalid body."); }
  const sub = evt && evt.payload && evt.payload.subscription && evt.payload.subscription.entity;
  if (!sub) return send(res, 200, { ignored: true });
  try {
    if (evt.event === "subscription.activated" || evt.event === "subscription.charged") {
      const uid = sub.notes && sub.notes.user_id;
      const plan = (sub.notes && sub.notes.plan) || planFromRazorpayId(sub.plan_id);
      if (uid && plan && sub.current_end) {
        await rpc("activate_plan", { p_uid: uid, p_email: (sub.notes && sub.notes.email) || "", p_plan: plan, p_sub_id: sub.id, p_status: sub.status || "active", p_period_end: new Date(sub.current_end * 1000).toISOString() });
      }
    } else if (["subscription.cancelled", "subscription.halted", "subscription.completed", "subscription.paused", "subscription.pending"].includes(evt.event)) {
      await rpc("set_subscription_status", { p_sub_id: sub.id, p_status: sub.status || evt.event.split(".")[1] });
    }
    send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    fail(res, 500, "server_error", "Will retry.");
  }
};
