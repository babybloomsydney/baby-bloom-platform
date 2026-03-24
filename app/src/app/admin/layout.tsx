import type { Metadata } from "next";
import { AdminDashboard } from "./AdminDashboard";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminDashboard>{children}</AdminDashboard>;
}
