import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth/svcSS";
import { causlEmbedOrigins } from "@/lib/causl/config";
import WorkspaceChat from "@/lib/causl/WorkspaceChat";

export const dynamic = "force-dynamic";

export default async function CauslPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const t = await getTranslations("causlWorkspace");
  const parentOrigin =
    typeof query.parentOrigin === "string" &&
    causlEmbedOrigins().includes(query.parentOrigin)
      ? query.parentOrigin
      : null;
  const nonce =
    typeof query.bridge === "string" && /^[a-f0-9-]{36}$/i.test(query.bridge)
      ? query.bridge
      : null;
  if (!parentOrigin || !nonce) return <p>{t("notConfigured")}</p>;
  const result = await requireAuth();
  const libraryId = Number(process.env.CAUSL_KB_MCP_SERVER_ID);
  return (
    <WorkspaceChat
      parentOrigin={parentOrigin}
      nonce={nonce}
      authenticated={
        !result.redirect &&
        Boolean(result.user) &&
        !result.user?.is_anonymous_user
      }
      libraryServerId={
        Number.isSafeInteger(libraryId) && libraryId > 0 ? libraryId : null
      }
      pageKind={query.pageKind === "colossus" ? "colossus" : "kb"}
    />
  );
}
