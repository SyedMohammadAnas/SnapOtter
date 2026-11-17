import { APP_VERSION } from "@snapotter/shared";
import { BookOpen, Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/contexts/i18n-context";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import { format } from "@/lib/format.js";

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

// Labels index into t.help.keyboardShortcuts rather than carrying English text,
// which is what the rest of the app does. The translations for these already
// existed in all 21 locales and simply were not being read.
const SHORTCUTS = [
  { keys: "mod+k", labelKey: "focusSearchBar" },
  { keys: "a-z", labelKey: "typeToSearch" },
  { keys: "mod+/", labelKey: "goToTools" },
  { keys: "mod+enter", labelKey: "processFile" },
  { keys: "mod+s", labelKey: "downloadResult" },
  { keys: "mod+shift+d", labelKey: "toggleTheme" },
  { keys: "mod+alt+1", labelKey: "goToResize" },
  { keys: "mod+alt+2", labelKey: "goToCrop" },
  { keys: "mod+alt+3", labelKey: "goToCompress" },
  { keys: "mod+alt+4", labelKey: "goToConvert" },
  { keys: "mod+alt+5", labelKey: "goToRemoveBackground" },
  { keys: "mod+alt+6", labelKey: "goToWatermarkText" },
  { keys: "mod+alt+7", labelKey: "goToStripMetadata" },
  { keys: "mod+alt+8", labelKey: "goToImageInfo" },
] as const;

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border p-4 text-start">
          <DialogTitle id="help-dialog-title">{t.help.heading}</DialogTitle>
          <DialogDescription className="sr-only">
            {t.help.gettingStarted.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <BookOpen className="h-4 w-4" />
              <h3 className="text-sm font-semibold">{t.help.gettingStarted.heading}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t.help.gettingStarted.description}
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-foreground">
              <Keyboard className="h-4 w-4" />
              <h3 className="text-sm font-semibold">{t.help.keyboardShortcuts.heading}</h3>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              {SHORTCUTS.map((s, i) => (
                <div
                  key={s.keys}
                  className={`flex items-center justify-between px-3 py-2 text-sm ${
                    i !== SHORTCUTS.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <span className="text-muted-foreground">
                    {t.help.keyboardShortcuts[s.labelKey]}
                  </span>
                  <Kbd keys={s.keys} />
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-border pt-2 text-xs text-muted-foreground">
            {format(t.help.versionLabel, { version: APP_VERSION })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kbd({ keys }: { keys: string }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {formatShortcut(keys)}
    </kbd>
  );
}
