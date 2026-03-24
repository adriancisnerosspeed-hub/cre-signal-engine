import { toast as sonnerToast } from "sonner";

type ToastKind = "error" | "success" | "info";

/**
 * Thin wrapper around Sonner so call-sites stay simple.
 * Maps our "kind" to Sonner's typed methods.
 */
export function toast(message: string, kind: ToastKind = "info") {
  if (typeof window === "undefined") return;

  switch (kind) {
    case "success":
      sonnerToast.success(message);
      break;
    case "error":
      sonnerToast.error(message);
      break;
    default:
      sonnerToast.info(message);
      break;
  }
}
