// POST /api/subscribe { plan }: creates a Razorpay subscription for the signed-in user.
const { ENV, PLANS, ready, send, fail, readJson, getUser, razorpay, rpc } = require("../lib/server");
module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  const r = ready();
  if (!r.auth || !r.payments) return fail(res, 503, "not_configured", "Paid plans open soon.");
  const user = await getUser(req);
  if (!user) return fail(res, 401, "signed_out", "Sign in first.");
  const { plan } = await readJson(req);
  if (!PLANS[plan]) return fail(res, 400, "bad_plan", "Pick a plan.");
  try {
    const st = await rpc("account_status", { p_uid: user.id, p_email: user.email });
    if (st && st.active && st.renewing) return fail(res, 409, "already_subscribed", "You already have an active plan. Cancel its renewal first to switch plans.");
    const sub = await razorpay("POST", "/subscriptions", {
      plan_id: ENV.plans[plan],
      total_count: 120,
      quantity: 1,
      customer_notify: 1,
      notes: { user_id: user.id, plan, email: user.email }
    });
    send(res, 200, { subscriptionId: sub.id, keyId: ENV.rzpKeyId, plan, email: user.email });
  } catch (e) {
    console.error(e);
    fail(res, 502, "payment_error", "Couldn't start the payment. Try again shortly.");
  }
};
