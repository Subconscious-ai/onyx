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
