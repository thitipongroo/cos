import { Home, ClipboardList, Camera, Package, User } from "lucide-react";
import { useState } from "react";

interface MobileNavProps {
  onNavigate?: (section: string) => void;
  activeSection?: string;
}

export function MobileNav({ onNavigate, activeSection = "home" }: MobileNavProps) {
  const navItems = [
    { id: "home", icon: Home, label: "Home" },
    { id: "tasks", icon: ClipboardList, label: "Tasks" },
    { id: "report", icon: Camera, label: "Report" },
    { id: "procurement", icon: Package, label: "Materials" },
    { id: "profile", icon: User, label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom z-50">
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate?.(item.id)}
              className="flex flex-col items-center justify-center gap-1 py-2 px-4 min-w-[60px] min-h-[44px] transition-colors"
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={`w-6 h-6 transition-colors ${
                  isActive ? "text-[var(--mobile-primary)]" : "text-[var(--mobile-text-secondary)]"
                }`}
              />
              <span
                className={`text-xs transition-colors ${
                  isActive ? "text-[var(--mobile-primary)] font-medium" : "text-[var(--mobile-text-tertiary)]"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
