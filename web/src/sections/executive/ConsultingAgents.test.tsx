import { render, screen } from "@tests/setup/test-utils";
import ConsultingAgents from "@/sections/executive/ConsultingAgents";

it("exposes the authorized interview, design, and analytics agents with actual native IDs", () => {
  render(
    <ConsultingAgents
      agents={[
        { id: 5, name: "Beca" },
        { id: 41, name: "Experiment design" },
        { id: 42, name: "Experiment analytics" },
        { id: 2, name: "Legacy interview" },
      ]}
    />
  );
  expect(
    screen.getByRole("link", { name: "Executive interview" })
  ).toHaveAttribute("href", "/app?agentId=5");
  expect(
    screen.getByRole("link", { name: "Experiment design" })
  ).toHaveAttribute("href", "/app?agentId=41");
  expect(
    screen.getByRole("link", { name: "Experiment analytics" })
  ).toHaveAttribute("href", "/app?agentId=42");
  expect(screen.queryByText("Legacy interview")).not.toBeInTheDocument();
});

it("never advertises a private agent absent from the authorized catalog", () => {
  render(<ConsultingAgents agents={[{ id: 5, name: "Burn 2.0" }]} />);
  expect(
    screen.queryByRole("link", { name: "Experiment analytics" })
  ).not.toBeInTheDocument();
});
