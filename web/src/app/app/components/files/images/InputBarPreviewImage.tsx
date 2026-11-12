"use client";

import { useState } from "react";
import { buildImgUrl } from "./utils";
import { FullImageModal } from "./FullImageModal";
import { useTranslations } from "next-intl";
import { useAuthenticatedFileUrl } from "@/lib/causl/hooks";

export function InputBarPreviewImage({ fileId }: { fileId: string }) {
  const t = useTranslations("chat.files");
  const imageUrl = useAuthenticatedFileUrl(buildImgUrl(fileId));
  const [fullImageShowing, setFullImageShowing] = useState(false);

  return (
    <>
      <FullImageModal
        fileId={fileId}
        open={fullImageShowing}
        onOpenChange={(open) => setFullImageShowing(open)}
      />
      <button
        type="button"
        aria-label={t("inputBarPreviewImage.viewFullImage.label")}
        onClick={() => setFullImageShowing(true)}
        className={`
          bg-transparent
          border-none
          flex
          items-center
          bg-accent-background-hovered
          border
          border-border
          rounded-md
          box-border
          h-6
      `}
      >
        <img
          alt={t("inputBarPreviewImage.image.alt")}
          className="h-6 w-6 object-cover rounded-lg bg-background cursor-pointer"
          src={imageUrl}
        />
      </button>
    </>
  );
}
