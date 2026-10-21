// POST /api/generate { tool, inputs }: uses one credit and writes the content with Claude.
const { ENV, ready, send, fail, readJson, getUser, rpc } = require("../lib/server");
const { buildPrompt } = require("../lib/prompts");

module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  const r = ready();
  if (!r.auth || !r.ai) return fail(res, 503, "not_configured", "Meetbound AI is launching soon.");
  const user = await getUser(req);
  if (!user) return fail(res, 401, "signed_out", "Sign in to use your free answers.");

  const body = await readJson(req);
  const built = buildPrompt(body.tool, body.inputs);
  if (built.error === "unknown_tool") return fail(res, 400, "unknown_tool", "Pick one of the tools.");
  if (built.error) return send(res, 400, { code: "missing_fields", missing: built.missing, message: "Fill in the required fields." });
  if (JSON.stringify(body.inputs || {}).length > 15000) return fail(res, 413, "too_long", "That's too much text. Shorten it and try again.");

  let credit;
  try {
    credit = await rpc("consume_credit", { p_uid: user.id, p_email: user.email, p_tool: body.tool });
  } catch (e) {
    console.error(e);
    return fail(res, 500, "server_error", "Couldn't check your plan. Try again shortly.");
  }
  if (!credit || !credit.ok) {
    return send(res, 402, { code: "no_credits", message: "You've used all your answers. Choose a plan to keep going.", status: credit && credit.status });
  }

  const refund = async () => {
    try { await rpc("refund_credit", { p_uid: user.id, p_source: credit.source }); } catch (e) { console.error(e); }
  };

  try {
    const ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ENV.anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: ENV.model, max_tokens: 1500, system: built.system, messages: [{ role: "user", content: built.prompt }] })
    });
    if (!ar.ok) {
      console.error("Anthropic error", ar.status, (await ar.text()).slice(0, 400));
      await refund();
      return fail(res, ar.status === 429 ? 429 : 502, ar.status === 429 ? "busy" : "ai_error", "The AI is busy right now. Your answer wasn't counted. Try again in a minute.");
    }
    const data = await ar.json();
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("").trim();
    if (!text) { await refund(); return fail(res, 502, "ai_error", "No answer came back. Your answer wasn't counted. Try again."); }
    const status = await rpc("account_status", { p_uid: user.id, p_email: user.email });
    return send(res, 200, { text, status });
  } catch (e) {
    console.error(e);
    await refund();
    return fail(res, 502, "ai_error", "Couldn't reach the AI. Your answer wasn't counted. Try again.");
  }
};
