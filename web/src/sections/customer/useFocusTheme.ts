"use client";

import { useEffect } from "react";
import "@/sections/customer/focus.css";

export default function useFocusTheme(enabled = true) {
  // The document boundary also themes native dialogs rendered in body portals.
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.dataset.customerDesign = "focus";
    return () => {
      delete root.dataset.customerDesign;
    };
  }, [enabled]);
}
