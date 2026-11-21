export interface MessageTemplateVars {
  click_ref: string;
  campaign_name?: string | null;
  ad_name?: string | null;
}

/**
 * Renderiza o template de mensagem do WhatsApp configurado na rota,
 * substituindo `{click_ref}`, `{campaign_name}` e `{ad_name}`. Variaveis sem
 * valor disponivel viram string vazia (nunca deixamos `{campaign_name}`
 * literal na mensagem final).
 */
export function renderMessageTemplate(template: string, vars: MessageTemplateVars): string {
  return template
    .replaceAll("{click_ref}", vars.click_ref)
    .replaceAll("{campaign_name}", vars.campaign_name ?? "")
    .replaceAll("{ad_name}", vars.ad_name ?? "");
}
