"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { Button, InputTypeIn, Text } from "@opal/components";
import { profileFields, type ExecutiveProfile } from "@/lib/executive/profile";
import type {
  CompanyProfileState,
  ProfileEditorState,
} from "@/sections/executive/types";

interface CompanyProfileProps {
  profile: ExecutiveProfile;
  onRefresh: () => void;
  persistentState?: [
    CompanyProfileState,
    Dispatch<SetStateAction<CompanyProfileState>>,
  ];
}

export function createCompanyProfileState(): CompanyProfileState {
  return { editor: null, busy: false, error: "", result: "", operation: null };
}

interface ProfileEditorProps {
  state: ProfileEditorState;
  onStateChange: Dispatch<SetStateAction<ProfileEditorState>>;
  onRefresh: () => void;
  onClose: () => void;
}

function ProfileEditor({
  state,
  onStateChange,
  onRefresh,
  onClose,
}: ProfileEditorProps) {
  const t = useTranslations("executive.companyProfile");
  const { original, fields, busy, error } = state;
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
    onStateChange((current) => ({ ...current, busy: true, error: "" }));
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
        onStateChange((current) => ({
          ...current,
          error: t(response.status === 409 ? "conflict" : "failed"),
        }));
        return;
      }
      onRefresh();
      onClose();
    } catch {
      onStateChange((current) => ({ ...current, error: t("failed") }));
    } finally {
      onStateChange((current) => ({ ...current, busy: false }));
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
                onStateChange((current) => ({
                  ...current,
                  fields: { ...current.fields, [key]: event.target.value },
                }))
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
  persistentState,
}: CompanyProfileProps) {
  const t = useTranslations("executive.companyProfile");
  const localState = useState(createCompanyProfileState);
  const [state, setState] = persistentState ?? localState;
  const { editor, busy, error, result } = state;

  function updateState(update: Partial<CompanyProfileState>) {
    setState((current) => ({ ...current, ...update }));
  }

  function updateEditor(update: SetStateAction<ProfileEditorState>) {
    setState((current) =>
      current.editor
        ? {
            ...current,
            editor:
              typeof update === "function" ? update(current.editor) : update,
          }
        : current
    );
  }

  async function refreshPreparation() {
    if (busy) return;
    const operation =
      state.operation ??
      JSON.stringify({
        operation_id: crypto.randomUUID(),
        checked_at: profile.checked_at ?? null,
        revision: profile.correction.revision,
      });
    updateState({ operation, busy: true, error: "", result: "" });
    try {
      const response = await fetch("/api/chat/executive-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: operation,
      });
      if (!response.ok) {
        if (response.status === 409) {
          updateState({ operation: null });
          onRefresh();
        }
        updateState({
          error: t(response.status === 409 ? "conflict" : "refreshFailed"),
        });
        return;
      }
      const receipt = await response.json();
      if (
        receipt.job_id !== JSON.parse(operation).operation_id ||
        !["updating", "ready", "not_found", "unavailable"].includes(
          receipt.preparation_status
        )
      ) {
        updateState({ error: t("refreshFailed") });
        return;
      }
      updateState({
        operation: null,
        result: t(
          receipt.preparation_status === "not_found"
            ? "refreshNoMatch"
            : receipt.preparation_status === "unavailable"
              ? "refreshUnavailable"
              : "refreshStarted"
        ),
      });
      onRefresh();
    } catch {
      updateState({ error: t("refreshFailed") });
    } finally {
      updateState({ busy: false });
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        prominence="tertiary"
        onClick={() =>
          updateState({
            editor: editor
              ? null
              : {
                  original: profile,
                  fields: profile.profile,
                  busy: false,
                  error: "",
                },
          })
        }
        aria-expanded={!!editor}
      >
        {t("title")}
      </Button>
      {editor && (
        <>
          <ProfileEditor
            state={editor}
            onStateChange={updateEditor}
            onRefresh={onRefresh}
            onClose={() => updateState({ editor: null })}
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
