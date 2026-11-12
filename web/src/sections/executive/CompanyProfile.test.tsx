import { fireEvent, render, screen, waitFor } from "@tests/setup/test-utils";
import CompanyProfile from "@/sections/executive/CompanyProfile";

it("saves only changed fields with the loaded revision and retains edits on conflict", async () => {
  const reload = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409 });
  render(
    <CompanyProfile
      profile={{
        profile: { company: "Old", website: "old.example.com" },
        correction: { revision: 3, fields: {} },
      }}
      onRefresh={reload}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Company profile" }));
  fireEvent.change(screen.getByLabelText("Company"), {
    target: { value: "New" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("changed")
  );
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/chat/executive-profile",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ revision: 3, fields: { company: "New" } }),
    })
  );
  expect(screen.getByLabelText("Company")).toHaveValue("New");
  expect(reload).toHaveBeenCalledTimes(1);
});

it("reloads effective context and closes the editor after a successful save", async () => {
  const reload = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  render(
    <CompanyProfile
      profile={{ profile: {}, correction: { revision: 0, fields: {} } }}
      onRefresh={reload}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Company profile" }));
  fireEvent.change(screen.getByLabelText("Company"), {
    target: { value: "New" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(
    screen.queryByRole("button", { name: "Save corrections" })
  ).not.toBeInTheDocument();
});

it("refreshes providers only by explicit action and reuses the operation after a network failure", async () => {
  const reload = jest.fn();
  const fetcher = jest
    .fn()
    .mockRejectedValueOnce(new Error("Response lost"))
    .mockImplementationOnce(async (_url, request) => ({
      ok: true,
      json: async () => ({
        job_id: JSON.parse(request.body).operation_id,
        preparation_status: "ready",
      }),
    }));
  global.fetch = fetcher;
  render(
    <CompanyProfile
      profile={{
        profile: { company: "Example" },
        checked_at: 10,
        correction: { revision: 3, fields: {} },
      }}
      onRefresh={reload}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Company profile" }));
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh PDL and public research" })
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh PDL and public research" })
  );
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  const first = fetcher.mock.calls[0];
  expect(first[0]).toBe("/api/chat/executive-profile");
  expect(first[1].method).toBe("POST");
  const receipt = JSON.parse(first[1].body);
  expect(receipt).toEqual({
    operation_id: expect.any(String),
    checked_at: 10,
    revision: 3,
  });
  expect(fetcher.mock.calls[1][1].body).toBe(first[1].body);
});

it("keeps the interview usable and prevents duplicate refresh clicks while PDL is pending", async () => {
  let complete: (value: unknown) => void = () => {};
  let operationId = "";
  global.fetch = jest.fn().mockImplementation((_url, request) => {
    operationId = JSON.parse(request.body).operation_id;
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  const reload = jest.fn();
  render(
    <CompanyProfile
      profile={{ profile: {}, correction: { revision: 0, fields: {} } }}
      onRefresh={reload}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Company profile" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh PDL and public research" })
  );
  expect(
    screen.getByRole("button", { name: "Refreshing preparation…" })
  ).toBeDisabled();
  expect(screen.getByLabelText("Company")).toBeEnabled();
  expect(reload).not.toHaveBeenCalled();
  complete({
    ok: true,
    json: async () => ({
      job_id: operationId,
      preparation_status: "not_found",
    }),
  });
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("status")).toHaveTextContent("No fresh PDL match");
});

it("does not claim a refresh was saved without the matching operation receipt", async () => {
  const reload = jest.fn();
  const fetcher = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: "ready", profile: { company: "Retained" } }),
  });
  global.fetch = fetcher;
  render(
    <CompanyProfile
      profile={{ profile: {}, correction: { revision: 0, fields: {} } }}
      onRefresh={reload}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Company profile" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh PDL and public research" })
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(reload).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh PDL and public research" })
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
});
