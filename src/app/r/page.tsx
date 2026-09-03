import { headers, cookies } from "next/headers";
import { after } from "next/server";
import { pickNextActiveNumber, getConfig } from "@/lib/redirect/store";
import { sendCapiEvent, buildFbc } from "@/lib/redirect/capi";

// Escolhe o próximo número em rodízio a cada acesso — nunca cachear/prerenderizar.
export const dynamic = "force-dynamic";

export default async function WhatsappRoundRobinPage(props: PageProps<"/r">) {
  const searchParams = await props.searchParams;
  const fbclidParam = searchParams?.fbclid;
  const fbclid = typeof fbclidParam === "string" ? fbclidParam : undefined;

  const [number, config, hdrs, cookieStore] = await Promise.all([
    pickNextActiveNumber(),
    getConfig(),
    headers(),
    cookies(),
  ]);

  if (!number) {
    return (
      <Shell>
        <p className="text-lg font-semibold text-white">Atendimento indisponível no momento</p>
        <p className="mt-2 text-sm text-white/80">Tente novamente em instantes.</p>
      </Shell>
    );
  }

  const waUrl = new URL(`https://wa.me/${number.phone}`);
  const message = number.message || config.defaultMessage;
  if (message) waUrl.searchParams.set("text", message);
  const waHref = waUrl.toString();

  const host = hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const clientIp = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = hdrs.get("user-agent") || undefined;
  const fbp = cookieStore.get("_fbp")?.value;
  const fbc = buildFbc(fbclid, cookieStore.get("_fbc")?.value);
  const eventSourceUrl = host ? `${proto}://${host}/r` : "/r";

  after(() => {
    sendCapiEvent({
      config,
      eventSourceUrl,
      clientIp,
      userAgent,
      fbp,
      fbc,
      contentName: number.label || undefined,
    });
  });

  return (
    <Shell>
      <div className="h-12 w-12 animate-pulse rounded-full bg-white/25" aria-hidden />
      <p className="mt-5 text-lg font-semibold text-white">Conectando você à Dra. Helena…</p>
      <p className="mt-2 text-sm text-white/85">Continue sua consulta agora pelo WhatsApp</p>
      <p className="mt-1 text-xs text-white/65">Atendimento rápido e personalizado</p>
      <a
        href={waHref}
        className="mt-6 inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-medium text-purple-700 shadow-sm hover:bg-white/90"
      >
        Se não abrir automaticamente, toque aqui
      </a>
      <script
        // Redirect assim que a página carrega — o link acima cobre os casos em
        // que o navegador (comum em apps in-app do Instagram/Facebook) bloqueia
        // o redirect automático via script.
        dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(waHref)});` }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-purple-600 to-purple-800 px-6 text-center">
      {children}
    </div>
  );
}
