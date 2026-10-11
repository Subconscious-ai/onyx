import { createCauslBridge } from "@/lib/causl/bridge";
import { installCauslNavigation } from "@/lib/causl/navigation";

const context = {
  kind: "causl:context",
  nonce: "frame",
  revision: 1,
  actor: { orgId: "org_b", userId: "alice" },
  selection: { page: "models", marketId: "market_b" },
};
const workspace = {
  chatId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  agentId: 11,
  scopeKey: "b".repeat(64),
  contextDigest: "c".repeat(64),
};

function link(href: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.innerHTML = "<span>Review change</span>";
  document.body.appendChild(anchor);
  return anchor;
}

describe("native workspace record links", () => {
  test("opens a review in the parent workspace only after caller verification", async () => {
    const controller = createCauslBridge({
      nonce: "frame",
      open: jest.fn().mockResolvedValue(workspace),
      onReady: jest.fn(),
      onError: jest.fn(),
    });
    const send = jest.fn();
    const remove = installCauslNavigation({
      document,
      parentOrigin: "https://kb.example",
      current: controller.navigationContext,
      send,
    });
    const anchor = link(
      "https://kb.example/dashboard/model?market=market_b#modelReview=sealed"
    );
    try {
      anchor.firstElementChild!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
      expect(send).not.toHaveBeenCalled();
      controller.receive(context);
      await controller.prepareSubmission();
      const click = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      anchor.firstElementChild!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(send).toHaveBeenCalledWith({
        kind: "causl:navigate",
        nonce: context.nonce,
        revision: context.revision,
        actor: context.actor,
        href: anchor.href,
      });
      controller.dispose();
      anchor.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      remove();
      anchor.remove();
    }
  });

  test("preserves external links, other markets and explicit new-tab gestures", async () => {
    const controller = createCauslBridge({
      nonce: "frame",
      open: jest.fn().mockResolvedValue(workspace),
      onReady: jest.fn(),
      onError: jest.fn(),
    });
    controller.receive(context);
    await controller.prepareSubmission();
    const send = jest.fn();
    const remove = installCauslNavigation({
      document,
      parentOrigin: "https://kb.example",
      current: controller.navigationContext,
      send,
    });
    const anchors = [
      link("https://external.example/dashboard/model?market=market_b"),
      link("https://kb.example/dashboard/model?market=market_a"),
      link("https://kb.example/auth/logout"),
      link("https://kb.example/dashboard/model?market=market_b&redirect=x"),
      link(
        "https://kb.example/dashboard/model?market=market_b&market=market_a"
      ),
      link("https://kb.example/dashboard/model?market=market_b#review=sealed"),
      link(
        "https://kb.example/dashboard/library?record=offering_b#review=sealed&extra=x"
      ),
      link("https://kb.example/dashboard/library?record=offering_b"),
    ];
    try {
      anchors.slice(0, -1).forEach((anchor) => {
        const click = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
        });
        anchor.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(false);
      });
      anchors.at(-1)!.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
        })
      );
      expect(send).not.toHaveBeenCalled();
      remove();
      anchors
        .at(-1)!
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
      expect(send).not.toHaveBeenCalled();
    } finally {
      remove();
      anchors.forEach((anchor) => anchor.remove());
    }
  });
});
