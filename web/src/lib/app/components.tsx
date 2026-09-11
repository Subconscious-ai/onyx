"use client";

import { useTranslations } from "next-intl";
import { useSettings } from "@/lib/settings/hooks";
import {
  DEFAULT_LOGO_SIZE_PX,
  NEXT_PUBLIC_DO_NOT_USE_TOGGLE_OFF_DANSWER_POWERED,
} from "@/lib/constants";
import { cn } from "@opal/utils";
import Text from "@/refresh-components/texts/Text";
import Truncated from "@/refresh-components/texts/Truncated";
import { Wordmark } from "@/sections/brand/wordmark";
import { DagMark } from "@/sections/brand/dag-mark";

export interface LogoProps {
  folded?: boolean;
  size?: number;
  className?: string;
  // Retained native flag: force the default product brand instead of a custom logo.
  onyxBranded?: boolean;
}

export function Logo({ folded, size, className, onyxBranded }: LogoProps) {
  const t = useTranslations("common");
  const resolvedSize = size ?? DEFAULT_LOGO_SIZE_PX;
  const { enterprise, logoUrl } = useSettings();
  const logoDisplayStyle = enterprise?.logo_display_style;
  const applicationName = enterprise?.application_name;

  if (onyxBranded) {
    return folded ? (
      <DagMark
        style={{ width: resolvedSize, height: resolvedSize }}
        className={cn("shrink-0", className)}
      />
    ) : (
      <Wordmark className={className} />
    );
  }

  if (!applicationName && !logoUrl) {
    return folded ? (
      <DagMark
        className={className}
        style={{ width: resolvedSize, height: resolvedSize }}
      />
    ) : (
      <Wordmark className={className} />
    );
  }

  const logo = logoUrl ? (
    <div
      className={cn(
        "aspect-square rounded-full overflow-hidden relative shrink-0",
        className
      )}
      style={{ height: resolvedSize }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={t("logo.image.alt")}
        src={logoUrl}
        className="object-cover object-center w-full h-full"
      />
    </div>
  ) : (
    <DagMark
      style={{ width: resolvedSize, height: resolvedSize }}
      className={cn("shrink-0", className)}
    />
  );

  const renderNameAndPoweredBy = (opts: {
    includeLogo: boolean;
    includeName: boolean;
  }) => {
    return (
      <div className="flex min-w-0 gap-2">
        {opts.includeLogo && logo}
        {!folded && (
          /* H3 text is 4px larger (28px) than the Logo icon (24px), so negative margin hack. */
          <div className="flex flex-1 flex-col -mt-0.5">
            {opts.includeName && (
              <Truncated headingH3>{applicationName}</Truncated>
            )}
            {!NEXT_PUBLIC_DO_NOT_USE_TOGGLE_OFF_DANSWER_POWERED &&
              !enterprise?.hide_onyx_branding && (
                <Text
                  secondaryBody
                  text03
                  className={"line-clamp-1 truncate"}
                  nowrap
                >
                  {t("logo.poweredBy.label")}
                </Text>
              )}
          </div>
        )}
      </div>
    );
  };

  // Handle "logo_only" display style
  if (logoDisplayStyle === "logo_only") {
    return renderNameAndPoweredBy({ includeLogo: true, includeName: false });
  }

  // Handle "name_only" display style
  if (logoDisplayStyle === "name_only") {
    return renderNameAndPoweredBy({ includeLogo: false, includeName: true });
  }

  // Handle "logo_and_name" or default behavior
  return applicationName ? (
    renderNameAndPoweredBy({ includeLogo: true, includeName: true })
  ) : folded ? (
    <DagMark
      style={{ width: resolvedSize, height: resolvedSize }}
      className={cn("shrink-0", className)}
    />
  ) : (
    <Wordmark className={className} />
  );
}
