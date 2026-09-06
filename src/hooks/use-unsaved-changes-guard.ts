"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Warns before a tab close/reload if a form has unsaved edits.
 *
 * All entity dialogs in this app use uncontrolled inputs (defaultValue, read
 * via FormData on submit) rather than React state, so dirtiness is tracked
 * via a single delegated "input"/"change" listener on the form element
 * instead of per-field handlers — this also covers the one dialog
 * (InquiryFormDialog) that mixes in a few controlled <select>s, since those
 * still emit native "change" events that bubble to the form.
 *
 * Only the native beforeunload case (tab close/reload) is covered, per
 * scope — not in-app Escape/backdrop dismissal.
 */
export function useUnsavedChangesGuard(
  formRef: RefObject<HTMLFormElement | null>,
  open: boolean,
) {
  const [isDirty, setIsDirty] = useState(false);

  // Reset at render time (not in an effect body) when `open` flips to
  // false, matching the render-time-sync pattern already used elsewhere in
  // this codebase (e.g. SocialBoard's posts-prop resync).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open && isDirty) setIsDirty(false);
  }

  useEffect(() => {
    if (!open) return;
    const form = formRef.current;
    if (!form) return;
    const markDirty = () => setIsDirty(true);
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    return () => {
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
    };
  }, [formRef, open]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return { isDirty, markClean: () => setIsDirty(false) };
}

/** Convenience: a form ref plus the guard, since every dialog needs both. */
export function useGuardedForm(open: boolean) {
  const formRef = useRef<HTMLFormElement>(null);
  const { isDirty, markClean } = useUnsavedChangesGuard(formRef, open);
  return { formRef, isDirty, markClean };
}
