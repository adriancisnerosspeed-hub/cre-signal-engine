type ToastKind = "error" | "success" | "info";

/**
 * Minimal "toast" API.
 * For now we fallback to `alert()` to guarantee the user sees the error.
 * This keeps UX fail-closed without adding dependencies.
 */
export function toast(message: string, _kind: ToastKind = "info") {
  if (typeof window === "undefined") return;
  // Replace with a real toast system later (e.g. Sonner) without changing call sites.
  window.alert(message);
}

