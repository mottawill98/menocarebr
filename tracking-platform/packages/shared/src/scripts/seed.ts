import { Client } from "pg";
import { generateClickRef } from "../click-ref.js";
import { normalizePhone, phoneHash, phoneLast4 } from "../phone.js";
import { buildPurchaseEventId } from "../meta-capi/event.js";

/**
 * Seed de desenvolvimento (item 44 do briefing): 1 rota, 2 numeros
 * fake, 10 clicks, alguns leads, alguns pedidos, alguns meta_events.
 *
 * NUNCA usa telefone real — todos os numeros sao da faixa fictícia
 * 55999990000XX, que nao corresponde a nenhuma linha real no Brasil.
 * Idempotente: pode rodar mais de uma vez (limpa os dados de seed
 * anteriores antes de inserir de novo, identificados pelo slug 'menocare').
 */
async function main() {
  const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("Defina DATABASE_URL (ou SUPABASE_DB_URL) apontando para o Postgres do Supabase.");
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    console.log("Limpando seed anterior (rota 'menocare')...");
    await client.query(`
      delete from public.meta_events where order_id in (select id from public.orders where click_ref in (select click_ref from public.clicks where route_id in (select id from public.routes where slug = 'menocare')));
      delete from public.orders where click_ref in (select click_ref from public.clicks where route_id in (select id from public.routes where slug = 'menocare'));
      delete from public.lead_bindings where click_id in (select id from public.clicks where route_id in (select id from public.routes where slug = 'menocare'));
      delete from public.clicks where route_id in (select id from public.routes where slug = 'menocare');
      delete from public.route_numbers where route_id in (select id from public.routes where slug = 'menocare');
      delete from public.routes where slug = 'menocare';
      delete from public.whatsapp_numbers where phone like '55999990000%';
    `);

    console.log("Criando rota 'menocare'...");
    const { rows: routeRows } = await client.query<{ id: string }>(
      `insert into public.routes (name, slug, active, whatsapp_message_template)
       values ('Menocare - campanha principal', 'menocare', true, $1)
       returning id`,
      ["Olá, gostaria de saber mais sobre o Menocare 💜\n#{click_ref}"]
    );
    const routeId = routeRows[0]!.id;

    console.log("Criando numeros de WhatsApp fake...");
    const { rows: numberRows } = await client.query<{ id: string }>(
      `insert into public.whatsapp_numbers (label, phone, active, weight, group_name)
       values
        ('Atendente 01 (seed)', '5599999000001', true, 10, 'menocare'),
        ('Atendente 02 (seed)', '5599999000002', true, 5, 'menocare')
       returning id`
    );
    const [numberA, numberB] = numberRows.map((r) => r.id) as [string, string];

    await client.query(
      `insert into public.route_numbers (route_id, whatsapp_number_id) values ($1, $2), ($1, $3)`,
      [routeId, numberA, numberB]
    );

    console.log("Gerando 10 clicks...");
    const campaigns = [
      { campaign_id: "120210000000001", campaign_name: "MENOPAUSA_CBO_01", adset_id: "120210000000011", adset_name: "MULHERES_45_55", ad_id: "120210000000111", ad_name: "VIDEO_03" },
      { campaign_id: "120210000000002", campaign_name: "REMARKETING_ABANDONO", adset_id: "120210000000012", adset_name: "ENGAJADAS_30D", ad_id: "120210000000112", ad_name: "CARROSSEL_01" },
    ];

    const clickIds: { id: string; click_ref: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const clickRef = generateClickRef();
      const numberId = i % 3 === 0 ? numberB : numberA;
      const campaign = campaigns[i % campaigns.length]!;
      const { rows } = await client.query<{ id: string; click_ref: string }>(
        `insert into public.clicks (
          click_ref, route_id, whatsapp_number_id, clicked_at, fbclid, utm_source, utm_medium, utm_campaign,
          campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, placement, referrer,
          client_user_agent, client_ip_address, extra_params
        ) values ($1,$2,$3, now() - ($4 || ' hours')::interval, $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        returning id, click_ref`,
        [
          clickRef,
          routeId,
          numberId,
          (10 - i) * 3,
          `fake_fbclid_${i}`,
          "meta",
          "paid_social",
          campaign.campaign_name,
          campaign.campaign_id,
          campaign.campaign_name,
          campaign.adset_id,
          campaign.adset_name,
          campaign.ad_id,
          campaign.ad_name,
          "instagram_stories",
          "https://www.instagram.com/",
          "Mozilla/5.0 (Linux; Android 13; SM-G991B) (seed)",
          "203.0.113.1",
          JSON.stringify({ seed: true }),
        ]
      );
      clickIds.push(rows[0]!);
    }

    console.log("Vinculando leads (7 de 10 clicks recebem mensagem)...");
    const leadClicks = clickIds.slice(0, 7);
    for (const [idx, click] of leadClicks.entries()) {
      const fakePhone = normalizePhone(`5599999${(100 + idx).toString().padStart(3, "0")}`);
      const hash = await phoneHash(fakePhone);
      const last4 = phoneLast4(fakePhone);

      await client.query(
        `insert into public.lead_bindings (click_id, click_ref, phone_hash, phone_last4, initial_message, source)
         values ($1,$2,$3,$4,$5,'crm_message')`,
        [click.id, click.click_ref, hash, last4, `Olá, gostaria de saber mais sobre o Menocare 💜\n#${click.click_ref}`]
      );
      await client.query(`update public.clicks set lead_bound = true, lead_bound_at = now() where id = $1`, [click.id]);
    }

    console.log("Gerando pedidos (4 de 7 leads compram)...");
    const orderClicks = leadClicks.slice(0, 4);
    const statuses: Array<{ status: string; paid: boolean }> = [
      { status: "paid", paid: true },
      { status: "paid", paid: true },
      { status: "approved", paid: true },
      { status: "pending", paid: false },
    ];

    const orderIds: { id: string; status: string; value: number }[] = [];
    for (const [idx, click] of orderClicks.entries()) {
      const fakePhone = normalizePhone(`5599999${(100 + idx).toString().padStart(3, "0")}`);
      const hash = await phoneHash(fakePhone);
      const last4 = phoneLast4(fakePhone);
      const crmOrderId = `SEED-${1000 + idx}`;
      const value = 297 + idx * 30;
      const { status, paid } = statuses[idx]!;

      const { rows } = await client.query<{ id: string }>(
        `insert into public.orders (
          crm_order_id, phone_hash, phone_last4, click_id, click_ref, status, raw_status, value, currency,
          seller, ordered_at, paid_at, attribution_status, attribution_method, raw_metadata
        ) values ($1,$2,$3,$4,$5,$6,$6,$7,'BRL','loja-oficial', now() - ($8 || ' hours')::interval, $9, 'attributed', 'click_ref', $10)
        returning id`,
        [
          crmOrderId,
          hash,
          last4,
          click.id,
          click.click_ref,
          status,
          value,
          (10 - idx) * 2,
          paid ? new Date().toISOString() : null,
          JSON.stringify({ seed: true, product: "Menocare 60 capsulas" }),
        ]
      );
      orderIds.push({ id: rows[0]!.id, status, value });
    }

    console.log("Gerando meta_events (sent / failed / pending)...");
    const eventStates: Array<{ status: string; http_status: number | null; attempts: number }> = [
      { status: "sent", http_status: 200, attempts: 1 },
      { status: "sent", http_status: 200, attempts: 2 },
      { status: "failed", http_status: 500, attempts: 3 },
      { status: "pending", http_status: null, attempts: 0 },
    ];

    for (const [idx, order] of orderIds.entries()) {
      const state = eventStates[idx]!;
      const eventId = buildPurchaseEventId(`SEED-${1000 + idx}`);
      await client.query(
        `insert into public.meta_events (
          event_id, order_id, event_name, event_time, payload_sanitized, status, attempts, last_attempt_at, sent_at, http_status, meta_response, error_message
        ) values ($1,$2,'Purchase', now(), $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          eventId,
          order.id,
          JSON.stringify({ data: [{ event_name: "Purchase", custom_data: { value: order.value, currency: "BRL" } }] }),
          state.status,
          state.attempts,
          state.attempts > 0 ? new Date().toISOString() : null,
          state.status === "sent" ? new Date().toISOString() : null,
          state.http_status,
          state.status === "sent" ? JSON.stringify({ events_received: 1 }) : state.status === "failed" ? JSON.stringify({ error: { message: "seed: falha simulada" } }) : null,
          state.status === "failed" ? "seed: falha simulada (HTTP 500)" : null,
        ]
      );
    }

    console.log("Seed concluido com sucesso.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
