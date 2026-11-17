import { LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { logout } from "@/lib/logout";
import { cn } from "@/lib/utils";

interface AvatarDropdownProps {
  onSettingsClick: () => void;
  /** Kept for call-site compatibility; shadcn menu uses theme tokens. */
  variant?: "light" | "dark";
}

function readStoredUsername(): string {
  try {
    return localStorage.getItem("snapotter-username") || "";
  } catch {
    return "";
  }
}

export function AvatarDropdown({ onSettingsClick }: AvatarDropdownProps) {
  const { t } = useTranslation();
  const { authEnabled, loading, username: sessionUsername, email } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  // The session is the source of truth: OIDC/SAML logins never run the login
  // form, so the localStorage copy it writes doesn't exist for them (#862).
  // localStorage only bridges the gap until the session fetch resolves, and
  // the "admin" terminal fallback (no-auth mode has no session to name) must
  // wait for that fetch; flashing it mid-load is #862's symptom again.
  const username = sessionUsername || readStoredUsername() || (loading ? "" : "admin");
  const initial = username.charAt(0).toUpperCase();

  const handleLogout = async () => {
    setLogoutFailed(false);
    const destination = await logout();
    if (destination === null) {
      setLogoutFailed(true);
      return;
    }
    window.location.href = destination;
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setLogoutFailed(false);
      }}
    >
      <DropdownMenuTrigger
        type="button"
        aria-label={username}
        data-testid="user-menu"
        className={cn(
          buttonVariants({ variant: "default", size: "icon-sm" }),
          "rounded-full bg-primary text-[#1a1814] hover:bg-primary/90",
        )}
      >
        {initial}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-medium">{email || username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="open-settings"
          onClick={() => {
            setOpen(false);
            onSettingsClick();
          }}
        >
          <Settings className="h-4 w-4" />
          {t.common.settings}
        </DropdownMenuItem>
        {authEnabled ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" />
              {t.auth.logout}
            </DropdownMenuItem>
            {logoutFailed ? (
              <p role="alert" className="px-3 pb-2 text-xs text-destructive">
                {t.auth.logoutFailed}
              </p>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
