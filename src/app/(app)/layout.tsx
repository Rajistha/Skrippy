import { SessionProvider } from "@/lib/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
