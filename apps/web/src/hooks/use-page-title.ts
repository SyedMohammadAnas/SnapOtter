import { useEffect } from "react";

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} - Konvertt` : "Konvertt";
    return () => {
      document.title = "Konvertt";
    };
  }, [title]);
}
