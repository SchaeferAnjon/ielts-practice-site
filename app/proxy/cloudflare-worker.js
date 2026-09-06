/**
 * AI 代理（Cloudflare Worker）：把真正的 API Key 藏在服务端，前端只拿一个口令。
 *
 * 部署：
 *   1. https://dash.cloudflare.com → Workers → 新建，把本文件粘进去
 *   2. Settings → Variables 加三个 Secret：
 *        UPSTREAM      上游接口，如 https://api.openai.com/v1/chat/completions（或 DeepSeek / 通义等 OpenAI 兼容接口）
 *        UPSTREAM_KEY  真正的 API Key
 *        ACCESS_CODE   自己定的口令（前端「AI 设置」的 Key 栏填它）
 *   3. 网站「AI 设置」里接口地址填 Worker 的 URL（https://xxx.workers.dev），Key 填 ACCESS_CODE
 * 免费额度每天 10 万次请求，个人用足够。
 */
const ALLOW_ORIGIN = "*"; // 想收紧就改成站点域名，如 https://schaeferanjon.github.io

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("POST only", { status: 405, headers: cors });
    const auth = request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${env.ACCESS_CODE}`) return new Response("bad access code", { status: 401, headers: cors });
    const upstream = await fetch(env.UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.UPSTREAM_KEY}` },
      body: await request.text(),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, "Content-Type": "application/json" } });
  },
};
