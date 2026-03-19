import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

import { Suspense } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense fallback={<div className="hidden md:flex flex-col border-r border-sidebar-border bg-sidebar w-60 transition-all duration-300" />}>
        <Sidebar />
      </Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
