import React from "react";
import { getTimelineStyles, TimelineTokens } from "./tokens";

export interface TimelineRootProps {
  children: React.ReactNode;
  tokens?: Partial<TimelineTokens>;
  state?: string;
}

/**
 * TimelineRoot provides the shared sizing contract for all timeline primitives.
 * It sets CSS variables derived from TimelineTokens so rail width, header height,
 * and padding stay consistent across the timeline.
 */
export function TimelineRoot({ children, tokens, state }: TimelineRootProps) {
  return (
    <div
      className="flex flex-col ps-(--timeline-agent-message-padding-left)"
      style={getTimelineStyles(tokens)}
      data-ai-progress={state}
    >
      {children}
    </div>
  );
}

export default TimelineRoot;
