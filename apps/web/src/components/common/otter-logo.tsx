import { appUrl } from "@/lib/app-url";

/**
 * Konvertt brand mark. The component keeps its historical name so existing
 * imports keep working; it renders the Konvertt "K-arrow" mark, not the
 * SnapOtter otter.
 */
export function OtterLogo({ className = "h-6 w-6" }: { className?: string }) {
  return <img src={appUrl("/konvertt-mark.svg")} alt="" aria-hidden="true" className={className} />;
}
