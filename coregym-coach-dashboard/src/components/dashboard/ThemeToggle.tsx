"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

// Both icons render and CSS picks the visible one from the theme class, so
// there is no hydration-sensitive state here.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useT();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("common.shell.toggleTheme")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
