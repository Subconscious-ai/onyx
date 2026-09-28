import { renderHook } from "@testing-library/react";
import useSWR from "swr";
import { useActiveAgent } from "./hooks";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
  useSWRConfig: jest.fn(),
}));
jest.mock("@opal/layouts", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/providers/UserProvider", () => {
  const user = { preferences: { pinned_assistants: [] } };
  return { useUser: () => ({ user, refreshUser: jest.fn() }) };
});
jest.mock("@/lib/settings/hooks", () => ({
  useSettings: () => ({ disable_default_assistant: false }),
}));
jest.mock("@/hooks/useChatSessions", () => ({
  __esModule: true,
  default: () => ({ currentChatSession: null }),
}));
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("agentId=5"),
}));

const assistant = { id: 0, name: "Assistant" };
const interviewer = { id: 5, name: "Burn 2.0" };

test("explicit interviewer never resolves to generic assistant while its data is unavailable", () => {
  jest
    .mocked(useSWR)
    .mockReturnValue({ data: [assistant], mutate: jest.fn() } as any);
  const { result, rerender } = renderHook(() => useActiveAgent());
  expect(result.current).toBeUndefined();
  jest.mocked(useSWR).mockReturnValue({
    data: [assistant, interviewer],
    mutate: jest.fn(),
  } as any);
  rerender();
  expect(result.current?.id).toBe(5);
});

test("initial loading leaves agent unresolved until the selected interviewer arrives", () => {
  jest
    .mocked(useSWR)
    .mockReturnValue({ data: undefined, mutate: jest.fn() } as any);
  const { result, rerender } = renderHook(() => useActiveAgent());
  expect(result.current).toBeUndefined();
  jest.mocked(useSWR).mockReturnValue({
    data: [assistant, interviewer],
    mutate: jest.fn(),
  } as any);
  rerender();
  expect(result.current?.id).toBe(5);
});
