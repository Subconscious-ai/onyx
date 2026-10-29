"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, InputTypeIn, Text } from "@opal/components";
import {
  profileFields,
  type ExecutiveProfile,
  type ProfileFields,
} from "@/lib/executive/profile";

interface CompanyProfileProps {
  profile: ExecutiveProfile;
  onRefresh: () => void;
}

interface ProfileEditorProps extends CompanyProfileProps {
  onClose: () => void;
}

function ProfileEditor({ profile, onRefresh, onClose }: ProfileEditorProps) {
  const t = useTranslations("executive.companyProfile");
  const [original] = useState(profile);
  const [fields, setFields] = useState<ProfileFields>(profile.profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const changed = Object.fromEntries(
      profileFields
        .filter((key) => fields[key] !== original.profile[key])
        .map((key) => [key, fields[key]])
    );
    if (!Object.keys(changed).length) {
      onClose();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/chat/executive-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: original.correction.revision,
          fields: changed,
        }),
      });
      if (!response.ok) {
        if (response.status === 409) onRefresh();
        setError(t(response.status === 409 ? "conflict" : "failed"));
        return;
      }
      onRefresh();
      onClose();
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      aria-label={t("title")}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Text font="secondary-body" color="text-03">
        {t("description")}
      </Text>
      {profileFields.map((key) => {
        const label = t(`fields.${key}`);
        return (
          <label key={key} className="flex flex-col gap-1">
            <Text font="secondary-action">{label}</Text>
            <InputTypeIn
              aria-label={label}
              value={fields[key] ?? ""}
              maxLength={500}
              variant={busy ? "disabled" : "primary"}
              onChange={(event) =>
                setFields({ ...fields, [key]: event.target.value })
              }
            />
            <Text font="secondary-body" color="text-03">
              {key in original.correction.fields
                ? t("corrected")
                : original.provider_profile?.[key]
                  ? t("provider")
                  : t("missing")}
            </Text>
          </label>
        );
      })}
      {error && (
        <div role="alert">
          <Text font="secondary-body">{error}</Text>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {t(busy ? "saving" : "save")}
        </Button>
        <Button prominence="tertiary" disabled={busy} onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

export default function CompanyProfile({
  profile,
  onRefresh,
}: CompanyProfileProps) {
  const t = useTranslations("executive.companyProfile");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const operation = useRef<string | null>(null);
  async function refreshPreparation() {
    if (busy) return;
    operation.current ??= JSON.stringify({
      operation_id: crypto.randomUUID(),
      checked_at: profile.checked_at ?? null,
      revision: profile.correction.revision,
    });
    setBusy(true);
    setError("");
    setResult("");
    try {
      const response = await fetch("/api/chat/executive-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: operation.current,
      });
      if (!response.ok) {
        if (response.status === 409) {
          operation.current = null;
          onRefresh();
        }
        setError(t(response.status === 409 ? "conflict" : "refreshFailed"));
        return;
      }
      const receipt = await response.json();
      if (
        receipt.job_id !== JSON.parse(operation.current).operation_id ||
        !["updating", "ready", "not_found", "unavailable"].includes(
          receipt.preparation_status
        )
      ) {
        setError(t("refreshFailed"));
        return;
      }
      operation.current = null;
      setResult(
        t(
          receipt.preparation_status === "not_found"
            ? "refreshNoMatch"
            : receipt.preparation_status === "unavailable"
              ? "refreshUnavailable"
              : "refreshStarted"
        )
      );
      onRefresh();
    } catch {
      setError(t("refreshFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        prominence="tertiary"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {t("title")}
      </Button>
      {open && (
        <>
          <ProfileEditor
            profile={profile}
            onRefresh={onRefresh}
            onClose={() => setOpen(false)}
          />
          <Text font="secondary-body" color="text-03">
            {t("refreshDescription")}
          </Text>
          <Button
            prominence="tertiary"
            disabled={busy || profile.preparation_pending}
            onClick={() => void refreshPreparation()}
          >
            {t(busy || profile.preparation_pending ? "refreshing" : "refresh")}
          </Button>
          {error && (
            <div role="alert">
              <Text font="secondary-body">{error}</Text>
            </div>
          )}
          {result && (
            <div role="status">
              <Text font="secondary-body">{result}</Text>
            </div>
          )}
        </>
      )}
    </div>
  );
}
