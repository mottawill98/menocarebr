import { test, expect } from "@playwright/test";

test.describe("Autenticação e RBAC (item 52/69)", () => {
  test("rota protegida redireciona para /login sem sessão", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("página de login renderiza e-mail, senha e botão", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("e-mail/senha inválidos mostram erro sem revelar detalhe da causa", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("naoexiste@example.com");
    await page.getByLabel("Senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible({ timeout: 10_000 });
  });
});

/**
 * Testes que dependem de um usuário real (VIEWER) já criado no projeto
 * Supabase de teste. Só rodam quando as credenciais são fornecidas via env
 * — sem elas, ficam pulados (não podemos criar um usuário Supabase real a
 * partir do Playwright sem um projeto configurado).
 */
const hasViewerCreds = Boolean(process.env.E2E_VIEWER_EMAIL && process.env.E2E_VIEWER_PASSWORD);

test.describe("RBAC: VIEWER não edita configurações", () => {
  test.skip(!hasViewerCreds, "Defina E2E_VIEWER_EMAIL e E2E_VIEWER_PASSWORD para rodar este teste.");

  test("VIEWER é redirecionado ao tentar abrir /configuracoes", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(process.env.E2E_VIEWER_EMAIL!);
    await page.getByLabel("Senha").fill(process.env.E2E_VIEWER_PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/configuracoes");
    await expect(page).toHaveURL(/erro=sem-permissao/);
  });
});
