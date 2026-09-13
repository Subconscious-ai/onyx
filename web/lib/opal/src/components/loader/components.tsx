import "@opal/components/loader/styles.css";
import { cn } from "@opal/utils";
import type { IconFunctionComponent } from "@opal/types";
import { SvgLoader } from "@opal/icons";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

// Marks render in `currentColor`, so color is applied as a text token.
// Default is the neutral `border-02`. Pass `color` to override, or
// `"inherit"` to set no class and let the ambient text color flow through.
type LoaderColor =
  | "inherit"
  | "border-02"
  | "text-02"
  | "text-03"
  | "text-04"
  | "text-05"
  | "status-error-05"
  | "status-success-05"
  | "status-warning-05";

const COLOR_CLASS: Record<LoaderColor, string> = {
  inherit: "",
  "border-02": "text-border-02",
  "text-02": "text-text-02",
  "text-03": "text-text-03",
  "text-04": "text-text-04",
  "text-05": "text-text-05",
  "status-error-05": "text-status-error-05",
  "status-success-05": "text-status-success-05",
  "status-warning-05": "text-status-warning-05",
};

// ---------------------------------------------------------------------------
// IconLoader
// ---------------------------------------------------------------------------

interface IconLoaderProps {
  /** Icon to spin. @default the generic `SvgLoader` spinner */
  icon?: IconFunctionComponent;

  /** Size of the icon, in pixels. @default 24 */
  size?: number;

  /** Mark color token. @default "border-02" */
  color?: LoaderColor;
}

/**
 * Generic loader: continuously spins the given icon. Pass any `@opal/icons`
 * icon, or use the default spinner. Holds still under `prefers-reduced-motion`.
 * Full-page loading uses the same indicator through `OnyxLoader`.
 */
function IconLoader({
  icon: Icon = SvgLoader,
  size = 24,
  color = "border-02",
}: IconLoaderProps) {
  return (
    <Icon
      size={size}
      role="status"
      aria-label="Loading"
      className={cn("shrink-0 motion-safe:animate-spin", COLOR_CLASS[color])}
    />
  );
}

// ---------------------------------------------------------------------------
// OnyxLoader
// ---------------------------------------------------------------------------

interface OnyxLoaderProps {
  /** Size of the animated mark, in pixels. @default 64 */
  size?: number;

  /** Mark color token. @default "border-02" */
  color?: LoaderColor;
}

// Retain the native API while using the existing neutral loading indicator.
function OnyxLoader({ size = 64, color = "border-02" }: OnyxLoaderProps) {
  return <IconLoader size={size} color={color} />;
}

export {
  IconLoader,
  type IconLoaderProps,
  OnyxLoader,
  type OnyxLoaderProps,
  type LoaderColor,
};
