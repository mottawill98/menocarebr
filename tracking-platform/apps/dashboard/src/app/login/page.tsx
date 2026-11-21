import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-lg bg-brand" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground">Menocare Tracking</h1>
          <p className="text-sm text-muted">Entre com sua conta para continuar</p>
        </div>
        <LoginForm nextPath={next} />
      </div>
    </div>
  );
}
