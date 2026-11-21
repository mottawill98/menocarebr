/**
 * Fake minimo do client Supabase, cobrindo apenas a fatia da API fluente
 * (`from().select().eq()...`) usada por `attribution.ts` via
 * `packages/shared/src/queries.ts`. Nao emula o supabase-js inteiro — so o
 * suficiente para testar a logica de prioridade de atribuicao sem um
 * Postgres real.
 */
export interface FakeLeadBinding {
  click_id: string;
  click_ref: string;
  bound_at: string;
}

export interface FakeClick {
  id: string;
  clicked_at: string;
}

export interface FakeSupabaseConfig {
  clicksByRef?: Record<string, { id: string; click_ref: string }>;
  leadBindingsByPhone?: Record<string, FakeLeadBinding[]>;
  clicksById?: Record<string, FakeClick>;
}

class FakeQueryBuilder {
  private table: string;
  private config: FakeSupabaseConfig;
  private eqFilters: Record<string, unknown> = {};
  private inFilter: { column: string; values: unknown[] } | null = null;
  private gteFilter: { column: string; value: string } | null = null;
  private lteFilter: { column: string; value: string } | null = null;

  constructor(table: string, config: FakeSupabaseConfig) {
    this.table = table;
    this.config = config;
  }

  select(_columns: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.eqFilters[column] = value;
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilter = { column, values };
    return this;
  }

  gte(column: string, value: string) {
    this.gteFilter = { column, value };
    return this;
  }

  lte(column: string, value: string) {
    this.lteFilter = { column, value };
    return this;
  }

  order(_column: string, _opts?: unknown) {
    return this;
  }

  limit(_n: number) {
    return this;
  }

  async maybeSingle() {
    if (this.table === "clicks") {
      const ref = this.eqFilters.click_ref as string;
      const click = this.config.clicksByRef?.[ref];
      return { data: click ?? null, error: null };
    }
    return { data: null, error: null };
  }

  then(resolve: (value: { data: unknown; error: null }) => void) {
    if (this.table === "lead_bindings") {
      const hash = this.eqFilters.phone_hash as string;
      const bindings = this.config.leadBindingsByPhone?.[hash] ?? [];
      resolve({ data: bindings, error: null });
      return;
    }

    if (this.table === "clicks" && this.inFilter) {
      const all = Object.values(this.config.clicksById ?? {});
      const filtered = all.filter((click) => {
        if (!this.inFilter!.values.includes(click.id)) return false;
        if (this.gteFilter && click.clicked_at < this.gteFilter.value) return false;
        if (this.lteFilter && click.clicked_at > this.lteFilter.value) return false;
        return true;
      });
      resolve({ data: filtered, error: null });
      return;
    }

    resolve({ data: [], error: null });
  }
}

export function createFakeSupabase(config: FakeSupabaseConfig) {
  return {
    from(table: string) {
      return new FakeQueryBuilder(table, config);
    },
  } as unknown as import("@tracking/shared").TypedSupabaseClient;
}
