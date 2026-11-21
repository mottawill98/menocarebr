import { requireProfile } from "@/lib/auth";
import { visibleNavItems } from "@/lib/nav-items";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const items = visibleNavItems(profile.role, process.env.NODE_ENV === "production");

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar items={items} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar profile={profile} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
