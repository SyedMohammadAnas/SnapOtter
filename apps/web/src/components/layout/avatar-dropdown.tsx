import { LogIn, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { logout } from "@/lib/logout";
import { cn } from "@/lib/utils";

interface AvatarDropdownProps {
  onSettingsClick: () => void;
  variant?: "light" | "dark";
}

function readStoredUsername(): string {
  try {
    return localStorage.getItem("snapotter-username") || "";
  } catch {
    return "";
  }
}

export function AvatarDropdown({ onSettingsClick, variant = "light" }: AvatarDropdownProps) {
  const { t } = useTranslation();
  const { authEnabled, loading, isAuthenticated, username: sessionUsername, email } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The session is the source of truth: OIDC/SAML logins never run the login
  // form, so the localStorage copy it writes doesn't exist for them (#862).
  // Guests have no username — show a short label instead of inventing "admin".
  const username =
    sessionUsername ||
    readStoredUsername() ||
    (loading ? "" : isAuthenticated ? "admin" : t.auth.loginButton || "Log in");
  const initial = isAuthenticated ? username.charAt(0).toUpperCase() : "?";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) setLogoutFailed(false);
  }, [open]);

  const handleLogout = async () => {
    setLogoutFailed(false);
    const destination = await logout();
    if (destination === null) {
      setLogoutFailed(true);
      return;
    }
    window.location.href = destination;
  };

  if (authEnabled && !loading && !isAuthenticated) {
    return (
      <Link
        to="/login"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:border-primary hover:bg-primary-subtle transition-colors"
        data-testid="guest-login"
      >
        <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
        {t.auth.loginButton}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-full bg-primary text-[#1a1814] flex items-center justify-center text-xs font-semibold hover:opacity-90 transition-opacity"
        aria-label={username}
        data-testid="user-menu"
      >
        {initial}
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 end-0 w-56 rounded-lg border shadow-lg z-50",
            variant === "dark"
              ? "bg-[#2a2a2a] border-[#444] text-[#e0e0e0]"
              : "bg-card border-border text-foreground",
          )}
        >
          <div
            className={cn(
              "px-3 py-2.5 text-sm font-medium truncate",
              variant === "dark" ? "text-[#e0e0e0]" : "text-foreground",
            )}
          >
            {email || username}
          </div>

          <div className={cn("border-t", variant === "dark" ? "border-[#444]" : "border-border")} />

          <button
            type="button"
            data-testid="open-settings"
            onClick={() => {
              setOpen(false);
              onSettingsClick();
            }}
            className={cn(
              "w-full text-start px-3 py-2 text-sm flex items-center gap-2 transition-colors",
              variant === "dark"
                ? "hover:bg-[#333] text-[#e0e0e0]"
                : "hover:bg-muted text-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            {t.common.settings}
          </button>

          {authEnabled && (
            <>
              <div
                className={cn("border-t", variant === "dark" ? "border-[#444]" : "border-border")}
              />
              <button
                type="button"
                onClick={handleLogout}
                className={cn(
                  "w-full text-start px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                  variant === "dark"
                    ? "hover:bg-[#333] text-[#e0e0e0]"
                    : "hover:bg-muted text-foreground",
                )}
              >
                <LogOut className="h-4 w-4" />
                {t.auth.logout}
              </button>
              {logoutFailed && (
                <p role="alert" className="px-3 pb-2 text-xs text-destructive">
                  {t.auth.logoutFailed}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
