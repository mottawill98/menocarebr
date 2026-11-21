import type { ProfileRole } from "@tracking/shared";

export interface NavItem {
  href: string;
  label: string;
  roles: ProfileRole[];
  devOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Visão geral", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/funil", label: "Funil", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/campanhas", label: "Campanhas", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/rotas", label: "Rotas", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/numeros", label: "Números", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/cliques", label: "Cliques", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/leads", label: "Leads", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/pedidos", label: "Pedidos", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/meta-capi", label: "Meta CAPI", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { href: "/webhooks", label: "Webhooks", roles: ["ADMIN"] },
  { href: "/usuarios", label: "Usuários", roles: ["ADMIN"] },
  { href: "/configuracoes", label: "Configurações", roles: ["ADMIN"] },
  { href: "/saude", label: "Saúde", roles: ["ADMIN", "MANAGER"] },
  { href: "/simulador", label: "Simulador", roles: ["ADMIN"], devOnly: true },
];

export function visibleNavItems(role: ProfileRole, isProduction: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role) && !(item.devOnly && isProduction));
}
