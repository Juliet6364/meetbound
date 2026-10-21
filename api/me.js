// GET /api/me: the signed-in user's plan and remaining uses.
const { ready, send, fail, getUser, rpc } = require("../lib/server");
module.exports = async (req, res) => {
  if (!ready().auth) return fail(res, 503, "not_configured", "Accounts aren't switched on yet.");
  const user = await getUser(req);
  if (!user) return fail(res, 401, "signed_out", "Please sign in.");
  try {
    const status = await rpc("account_status", { p_uid: user.id, p_email: user.email });
    send(res, 200, { email: user.email, ...status });
  } catch (e) {
    console.error(e);
    fail(res, 500, "server_error", "Couldn't load your account. Try again shortly.");
  }
};
