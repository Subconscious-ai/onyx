"use client";

import { useState } from "react";
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
        <ProfileEditor
          profile={profile}
          onRefresh={onRefresh}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
