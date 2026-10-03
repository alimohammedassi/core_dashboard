"use client";

import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { PASSWORD_TOGGLE_CLASS } from "./styles";

export function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? t("auth.shell.hidePassword") : t("auth.shell.showPassword")}
      aria-pressed={show}
      className={PASSWORD_TOGGLE_CLASS}
    >
      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
