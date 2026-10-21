// GET /api/config: public settings the page needs (no secrets).
const { ENV, PLANS, ready, send } = require("../lib/server");
module.exports = (req, res) => {
  send(res, 200, {
    ready: ready(),
    supabaseUrl: ENV.supabaseUrl,
    supabaseAnonKey: ENV.supabaseAnon,
    razorpayKeyId: ENV.rzpKeyId,
    plans: PLANS,
    freeUses: 3
  });
};
