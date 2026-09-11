import type { IconProps } from "@opal/types";
import { DagMark } from "@/sections/brand/dag-mark";

/** Adapt native numeric icon sizing to the canonical design-system mark. */
export function SubconsciousIcon({
  size = 16,
  width,
  height,
  ...props
}: IconProps) {
  return <DagMark {...props} width={width ?? size} height={height ?? size} />;
}
