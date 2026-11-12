import { prepareInterviewLibrary } from "@/lib/executive/library-connection";

const agent = {
  id: 2,
  tools: [{ name: "library_snapshot", mcp_server_id: 22 }],
};

afterEach(() => jest.restoreAllMocks());

test("an unconnected executive needs the existing workspace authorization before a send", async () => {
  const fetch = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      mcp_servers: [{ id: 22, user_can_authenticate: false }],
    }),
  } as Response);
  expect(await prepareInterviewLibrary(agent)).toEqual({
    serverId: 22,
    connected: false,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "/api/mcp/servers/persona/2",
    expect.any(Object)
  );
});
