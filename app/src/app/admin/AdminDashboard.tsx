"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { useAuth } from "@/contexts/AuthContext";

export function AdminDashboard({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { role } = useAuth();

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem("bb-sidebar-collapsed") === "true");
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("bb-sidebar-collapsed", String(next));
      return next;
    });
  }

  // Admin and super_admin both use admin navigation
  const sidebarRole = role === "super_admin" ? "super_admin" : "admin";

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <div className={`fixed inset-y-0 left-0 z-50 transition-all duration-200 ${sidebarCollapsed ? "w-16" : "w-64"}`}>
          <Sidebar role={sidebarRole} collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        </div>
      </div>

      {/* Mobile Navigation */}
      <MobileNav
        role={sidebarRole}
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
      />

      {/* Main Content Area */}
      <div className={`flex flex-1 flex-col transition-all duration-200 ${sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"}`}>
        <DashboardHeader onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
