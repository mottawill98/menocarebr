import type { Alert } from "./analysis/recommendation";

/** Um alerta de campanha com a identificação da campanha anexada — usado ao agregar alertas de várias campanhas para um período. */
export interface AccountAlert extends Alert {
  campaignId: string;
  campaignName: string;
}
