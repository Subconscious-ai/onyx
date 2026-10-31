import { renderHook, waitFor } from "@testing-library/react";
import { useAuthenticatedFileUrl } from "./useAuthenticatedFileUrl";

const originalFetch = global.fetch;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

afterEach(() => {
  global.fetch = originalFetch;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  window.history.replaceState({}, "", "/");
});

test("host file tags receive a fetched blob URL and release it on unmount", async () => {
  window.history.replaceState({}, "", "/causl?hostAuth=1");
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["private image"]),
  });
  URL.createObjectURL = jest.fn().mockReturnValue("blob:private-image");
  URL.revokeObjectURL = jest.fn();
  const hook = renderHook(() =>
    useAuthenticatedFileUrl("/api/chat/file/private-image")
  );
  expect(hook.result.current).toBeUndefined();
  await waitFor(() => expect(hook.result.current).toBe("blob:private-image"));
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/chat/file/private-image",
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  hook.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-image");
});

test("rejected host file requests never expose a raw cookie-authenticated URL", async () => {
  window.history.replaceState({}, "", "/causl?hostAuth=1");
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  const hook = renderHook(() =>
    useAuthenticatedFileUrl("/api/chat/file/private-image")
  );
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(hook.result.current).toBeUndefined();
});

test("native standalone file tags retain their existing URL", () => {
  global.fetch = jest.fn();
  const hook = renderHook(() =>
    useAuthenticatedFileUrl("/api/chat/file/native-image")
  );
  expect(hook.result.current).toBe("/api/chat/file/native-image");
  expect(global.fetch).not.toHaveBeenCalled();
});
