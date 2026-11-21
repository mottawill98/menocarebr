import { signWebhookPayload } from "@tracking/shared";

/**
 * CLI que finge ser o CRM enviando webhooks para o Worker (item 54). Util
 * para testar os endpoints sem precisar do dashboard rodando.
 *
 * Uso:
 *   tsx scripts/mocks/crm-webhook-mock.ts message <click_ref> [telefone]
 *   tsx scripts/mocks/crm-webhook-mock.ts order <click_ref> <valor> [telefone] [status]
 *
 * Variaveis de ambiente:
 *   WORKER_URL           (default http://localhost:8787)
 *   CRM_WEBHOOK_SECRET    (obrigatorio — precisa ser o mesmo segredo do Worker)
 */
const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8787";
const SECRET = process.env.CRM_WEBHOOK_SECRET;

async function postSigned(path: string, body: unknown) {
  if (!SECRET) {
    console.error("Defina CRM_WEBHOOK_SECRET (o mesmo configurado no Worker via `wrangler secret put`).");
    process.exit(1);
  }

  const rawBody = JSON.stringify(body);
  const { timestamp, signature } = await signWebhookPayload(SECRET, rawBody);

  const res = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signature,
    },
    body: rawBody,
  });

  console.log(`${path} -> HTTP ${res.status}`);
  console.log(await res.text());
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "message") {
    const [clickRef, phone = "5599999123456"] = args;
    if (!clickRef) throw new Error("uso: message <click_ref> [telefone]");
    await postSigned("/api/v1/webhooks/crm/message", {
      phone,
      message: `Olá, gostaria de saber mais sobre o Menocare 💜\n#${clickRef}`,
    });
    return;
  }

  if (command === "order") {
    const [clickRef, value = "297", phone = "5599999123456", status = "paid"] = args;
    if (!clickRef) throw new Error("uso: order <click_ref> <valor> [telefone] [status]");
    await postSigned("/api/v1/webhooks/crm/order", {
      order_id: `MOCK-${Date.now()}`,
      phone,
      status,
      value: Number(value),
      currency: "BRL",
      click_ref: clickRef,
    });
    return;
  }

  console.error("Comando desconhecido. Use 'message' ou 'order'.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
