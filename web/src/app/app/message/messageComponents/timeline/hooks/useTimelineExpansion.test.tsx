import { act, renderHook } from "@testing-library/react";
import { useTimelineExpansion } from "@/app/app/message/messageComponents/timeline/hooks/useTimelineExpansion";

test("shows workspace agent steps during work and collapses when the answer arrives", () => {
  const { result, rerender } = renderHook(
    ({ stopped, answer }) =>
      useTimelineExpansion(stopped, undefined, answer, true),
    { initialProps: { stopped: false, answer: false } }
  );
  expect(result.current.isExpanded).toBe(true);
  rerender({ stopped: false, answer: true });
  expect(result.current.isExpanded).toBe(false);
});

test("keeps manual expansion after Stop and leaves ordinary chat collapsed", () => {
  const native = renderHook(() => useTimelineExpansion(false, undefined));
  expect(native.result.current.isExpanded).toBe(false);
  const { result, rerender } = renderHook(
    ({ stopped }) => useTimelineExpansion(stopped, undefined, false, true),
    { initialProps: { stopped: false } }
  );
  act(() => result.current.handleToggle());
  act(() => result.current.handleToggle());
  rerender({ stopped: true });
  expect(result.current.isExpanded).toBe(true);
});
