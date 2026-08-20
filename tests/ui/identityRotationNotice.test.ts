import { identityRotationNoticeMessage } from "../../packages/ui/src/identityRotationNotice";

describe("identity rotation notice presentation", () => {
  it("describes revocation without attributing a revoker", () => {
    expect(identityRotationNoticeMessage("revoked")).toBe(
      "This installation's former identity was revoked. Previous Clipboard History was deleted and devices must be paired again.",
    );
  });

  it("describes identity loss as a reset instead of revocation", () => {
    expect(identityRotationNoticeMessage("identity-loss")).toBe(
      "This installation's former identity was reset. Previous Clipboard History was deleted and devices must be paired again.",
    );
  });
});
