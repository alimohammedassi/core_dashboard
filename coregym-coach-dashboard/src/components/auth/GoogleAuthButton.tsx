"use client";

/* Google auth atoms shared by the login and signup pages: the "or" hairline
   divider and the ghost-pill Google button — identical icon, styling, spinner
   and disabled states on both pages. Labels come from each page's own i18n
   keys; the OAuth initiation itself lives in useGoogleAuth. */

import { authGhostPillClass, authMicroLabelClass } from "./styles";
import { Spinner } from "@/components/ui/spinner";

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
      />
    </svg>
  );
}

export function AuthOrDivider({ isEn, label }: { isEn: boolean; label: string }) {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-white/[0.08]" />
      </div>
      <div className="relative flex justify-center">
        <span className={`bg-[#121310] px-2 text-white/40 ${authMicroLabelClass(isEn)}`}>
          {label}
        </span>
      </div>
    </div>
  );
}

export function GoogleAuthButton({
  isEn,
  loading,
  disabled,
  onClick,
  label,
  loadingLabel,
}: {
  isEn: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={authGhostPillClass(isEn)}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingLabel}
        </>
      ) : (
        <>
          <GoogleIcon />
          {label}
        </>
      )}
    </button>
  );
}
