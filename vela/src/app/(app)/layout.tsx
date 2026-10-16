import { isSharedPreviewDemoMode, requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, sharedPreview] = await Promise.all([requireUser(), isSharedPreviewDemoMode()]);
  return (
    <AppShell user={{ firstName: user.firstName, lastName: user.lastName, email: user.email, isAdmin: user.role === "ADMIN" }} sharedPreview={sharedPreview}>
      {children}
    </AppShell>
  );
}
