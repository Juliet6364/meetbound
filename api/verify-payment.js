// POST /api/verify-payment: checks Razorpay's signature after checkout and switches the plan on.
const { ENV, ready, send, fail, readJson, getUser, razorpay, rpc, hmacHex, safeEqual } = require("../lib/server");
module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  if (!ready().payments || !ready().auth) return fail(res, 503, "not_configured", "Paid plans open soon.");
  const user = await getUser(req);
  if (!user) return fail(res, 401, "signed_out", "Sign in first.");
  const b = await readJson(req);
  const expected = hmacHex(ENV.rzpSecret, String(b.razorpay_payment_id) + "|" + String(b.razorpay_subscription_id));
  if (!safeEqual(expected, b.razorpay_signature)) return fail(res, 400, "bad_signature", "We couldn't verify that payment. If money was taken, email us and we'll fix it.");
  try {
    const sub = await razorpay("GET", "/subscriptions/" + encodeURIComponent(b.razorpay_subscription_id));
    if (!sub.notes || sub.notes.user_id !== user.id) return fail(res, 403, "wrong_user", "This payment belongs to a different account.");
    const plan = sub.notes.plan;
    const end = sub.current_end ? new Date(sub.current_end * 1000) : new Date(Date.now() + 31 * 864e5);
    await rpc("activate_plan", { p_uid: user.id, p_email: user.email, p_plan: plan, p_sub_id: sub.id, p_status: sub.status || "active", p_period_end: end.toISOString() });
    const status = await rpc("account_status", { p_uid: user.id, p_email: user.email });
    send(res, 200, { ok: true, status });
  } catch (e) {
    console.error(e);
    fail(res, 502, "payment_error", "Payment received, but we couldn't switch your plan on yet. It will update within a few minutes.");
  }
};
