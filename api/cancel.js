// POST /api/cancel: stops the user's subscription from renewing. Access continues to the end of the paid month.
const { ready, send, fail, getUser, razorpay, rpc } = require("../lib/server");
module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  if (!ready().payments || !ready().auth) return fail(res, 503, "not_configured", "Paid plans open soon.");
  const user = await getUser(req);
  if (!user) return fail(res, 401, "signed_out", "Sign in first.");
  try {
    const st = await rpc("account_status", { p_uid: user.id, p_email: user.email });
    if (!st || !st.subscription_id) return fail(res, 404, "no_subscription", "You don't have a subscription to cancel.");
    await razorpay("POST", "/subscriptions/" + encodeURIComponent(st.subscription_id) + "/cancel", { cancel_at_cycle_end: 1 });
    await rpc("set_subscription_status", { p_sub_id: st.subscription_id, p_status: "cancel_scheduled" });
    const status = await rpc("account_status", { p_uid: user.id, p_email: user.email });
    send(res, 200, { ok: true, status });
  } catch (e) {
    console.error(e);
    fail(res, 502, "payment_error", "Couldn't cancel right now. Try again, or email us and we'll do it for you.");
  }
};
