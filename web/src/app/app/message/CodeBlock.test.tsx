import { render, screen, waitFor } from "@tests/setup/test-utils";
import { CodeBlock } from "@/app/app/message/CodeBlock";

const mockRender = jest.fn();
jest.mock(
  "mermaid",
  () => ({
    __esModule: true,
    default: {
      initialize: jest.fn(),
      render: (...args: unknown[]) => mockRender(...args),
    },
  }),
  { virtual: true }
);

beforeEach(() => {
  mockRender.mockReset();
  mockRender.mockResolvedValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Discover</text><script>alert(1)</script></svg>',
  });
});

it("renders a Mermaid diagram and strips executable SVG content", async () => {
  render(
    <CodeBlock
      className="language-mermaid"
      codeText="flowchart LR\nA[Discover] --> B[Buy]"
    />
  );
  const diagram = await screen.findByRole("img", { name: "Diagram" });
  expect(diagram.querySelector("svg")).toBeInTheDocument();
  expect(diagram.querySelector("script")).toBeNull();
  expect(screen.getByText("Diagram source")).toBeInTheDocument();
});

it("keeps invalid diagram source available without crashing the message", async () => {
  mockRender.mockRejectedValue(new Error("parse error"));
  render(<CodeBlock className="language-mermaid" codeText="flowchart ???" />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Diagram unavailable")
  );
  expect(screen.getByText("flowchart ???")).toBeInTheDocument();
});

it("never paints an old render over a newer streamed diagram", async () => {
  let finishOld: (result: { svg: string }) => void = () => {};
  mockRender.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      })
  );
  const { rerender } = render(
    <CodeBlock className="language-mermaid" codeText="flowchart LR\nA[Old]" />
  );
  await waitFor(() => expect(mockRender).toHaveBeenCalled());
  rerender(
    <CodeBlock className="language-mermaid" codeText="flowchart LR\nA[New]" />
  );
  finishOld({ svg: "<svg><text>Old render</text></svg>" });
  await screen.findByRole("img", { name: "Diagram" });
  await waitFor(() =>
    expect(screen.queryByText("Old render")).not.toBeInTheDocument()
  );
});

it("draws a Rehoboam evidence view from its chat file and fetches nothing else", async () => {
  const view = require("@tests/fixtures/rehoboam-effect-view-973cdbb7.json");
  const fetchMock = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => view });
  global.fetch = fetchMock as unknown as typeof fetch;
  render(
    <CodeBlock
      className="language-rehoboam-view"
      codeText="/api/chat/file/9f2c-effect"
    />
  );
  expect(
    await screen.findByRole("toolbar", { name: "Filter and sort effects" })
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/chat/file/9f2c-effect", {
    credentials: "include",
  });

  fetchMock.mockClear();
  render(
    <CodeBlock
      className="language-rehoboam-view"
      codeText="https://example.com/view.json"
    />
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Evidence unavailable"
    )
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
