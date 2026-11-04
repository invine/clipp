import { expect, test } from "@playwright/test";

test("a late relay save after runtime replacement cannot close or error over a newer editor", async ({
  page,
}) => {
  await page.goto("/relay-address.html");
  await page.getByRole("button", { name: "Add relay" }).first().click();
  await page
    .getByRole("textbox", { name: "New relay address" })
    .fill("/dns4/old.example/tcp/443/wss/p2p/old");
  await page.getByRole("button", { name: "Add relay" }).last().click();
  await expect(
    page.getByRole("button", { name: "Add relay" }).last()
  ).toBeDisabled();

  await page.getByRole("button", { name: "Replace runtime owner" }).click();
  await page.getByRole("button", { name: "Add relay" }).first().click();
  const draft = page.getByRole("textbox", { name: "New relay address" });
  await draft.fill("/dns4/new.example/tcp/443/wss/p2p/new");
  await page.getByRole("button", { name: "Reject old save" }).click();
  await expect(draft).toHaveValue("/dns4/new.example/tcp/443/wss/p2p/new");
  await expect(page.getByText("Failed to save relay changes.")).toHaveCount(0);
});
