import { expect, test, type Page } from "@playwright/test";

const password = "a long test password";

/** Creates a fresh account through the screens. With no invite code it also creates a family; with one it joins
 * that family. Leaves the page on the Overview. */
async function signUp(page: Page, name = "Annie Tester", inviteCode?: string) {
  const email = `${name.split(" ")[0].toLowerCase()}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  if (inviteCode) {
    await page.getByLabel("Invite code").fill(inviteCode);
    await page.getByRole("button", { name: "Join family" }).click();
  } else {
    await page.getByLabel("Family name").fill("Tester Family");
    await page.getByRole("button", { name: "Create family" }).click();
  }
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`, ${name.split(" ")[0]}`);
  return email;
}

/** Adds a task from the Tasks page and gives it to the only family member, using the suggestion card. */
async function addTask(page: Page, title: string) {
  await page.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Tasks" }).click();
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Task title").fill(title);
  await page.getByLabel("Location").fill("Oak Pharmacy");
  await page.getByRole("button", { name: "Create task" }).click();
  // With no AI key the card falls back to its plain rule, so this also checks that fallback.
  await expect(page.getByRole("heading", { name: "Who should handle this?" })).toBeVisible();
  await page.getByRole("button", { name: /^Assign to / }).click();
  await expect(page.getByRole("heading", { name: "Who should handle this?" })).toBeHidden();
  await expect(page.locator("#tasks-panel article", { hasText: title })).toBeVisible();
}

test("signing up, signing out and signing back in", async ({ page }) => {
  const email = await signUp(page);
  await page.getByRole("button", { name: /^Account menu for / }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome", exact: true })).toBeVisible();

  // A wrong password is refused, and the right one gets back in.
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Annie");
});

test("creating a task, completing it and finding it under Completed", async ({ page }) => {
  await signUp(page);
  await addTask(page, "Pick up medication");

  const row = page.locator("#tasks-panel article", { hasText: "Pick up medication" });
  await row.getByRole("button", { name: "Mark complete: Pick up medication" }).click();
  // The row celebrates, slides away and is removed from the open list.
  await expect(row).toHaveCount(0);

  await page.getByRole("tab", { name: /^Completed/ }).click();
  const done = page.locator("#tasks-panel article", { hasText: "Pick up medication" });
  await expect(done).toBeVisible();
  await expect(done.getByRole("button", { name: "Reopen: Pick up medication" })).toHaveAttribute("aria-pressed", "true");
});

test("editing and deleting a task from its details", async ({ page }) => {
  await signUp(page);
  await addTask(page, "Collect eye drops");

  await page.locator("#tasks-panel article", { hasText: "Collect eye drops" }).getByRole("button", { name: "Collect eye drops", exact: true }).click();
  const details = page.getByRole("dialog");
  await details.getByRole("button", { name: "Edit" }).click();
  await details.getByLabel("Location").fill("Guardian, Tampines Mall");
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(details.getByText("Guardian, Tampines Mall")).toBeVisible();
  await details.getByText(/^History/).click();
  await expect(details.getByText(/changed the location/)).toBeVisible();

  page.once("dialog", (confirm) => confirm.accept());
  await details.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#tasks-panel article", { hasText: "Collect eye drops" })).toHaveCount(0);
});

test("the calendar shows each member's tasks for the week", async ({ page }) => {
  await signUp(page);
  await addTask(page, "Water the plants");

  await page.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
  const grid = page.getByRole("table");
  await expect(grid.getByRole("rowheader", { name: /Annie/ })).toBeVisible();
  await expect(grid.getByText("Water the plants")).toBeVisible();
  await expect(grid.getByText("No calendar linked")).toBeVisible();

  // Moving a week on and back again.
  const heading = page.locator("main h2").first();
  const thisWeek = await heading.textContent();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(heading).not.toHaveText(thisWeek ?? "");
  await page.getByRole("button", { name: "This week" }).click();
  await expect(heading).toHaveText(thisWeek ?? "");
});

test("customising the Overview is saved to the account", async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole("heading", { name: "The family" })).toBeVisible();

  await page.getByRole("button", { name: "Customise" }).click();
  await page.getByRole("dialog").getByRole("checkbox", { name: "The family" }).uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "The family" })).toBeHidden();

  // Still hidden after a reload, because it was saved to the account rather than the browser tab.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Annie");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The family" })).toBeHidden();
});

test("a change on one person's screen appears on another's without reloading", async ({ page, browser }) => {
  await signUp(page);
  await page.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Family" }).click();
  const inviteCode = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(inviteCode.length).toBeGreaterThanOrEqual(6);

  // A second person, in a separate browser with their own sign-in, joins the family and opens Tasks.
  const otherBrowser = await browser.newContext();
  const other = await otherBrowser.newPage();
  await signUp(other, "Ben Tester", inviteCode);
  await other.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Tasks" }).click();
  await expect(other.locator("#tasks-panel article", { hasText: "Buy cooking oil" })).toHaveCount(0);

  // The first person adds a task; the second sees it arrive on its own.
  await addTask(page, "Buy cooking oil");
  await expect(other.locator("#tasks-panel article", { hasText: "Buy cooking oil" })).toBeVisible({ timeout: 25_000 });
  await otherBrowser.close();
});

test("sharing a task between two people, and giving someone a task from the Family page", async ({ page, browser }) => {
  await signUp(page);
  await page.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Family" }).click();
  const inviteCode = (await page.locator("code").first().textContent())?.trim() ?? "";
  const otherBrowser = await browser.newContext();
  await signUp(await otherBrowser.newPage(), "Ben Tester", inviteCode);
  await otherBrowser.close();

  // Ben's window on the Family page has a short form that puts a task straight on his list.
  await page.reload();
  await page.getByText("Ben Tester").first().click();
  const member = page.getByRole("dialog");
  await member.getByRole("button", { name: "Give Ben a task" }).click();
  await member.getByLabel("What needs doing").fill("Fetch the groceries");
  await member.getByRole("button", { name: "Add to Ben’s list" }).click();
  await expect(member.getByRole("button", { name: /Fetch the groceries/ })).toBeVisible();
  await member.getByRole("button", { name: "Close" }).click();

  // On Tasks, Annie joins Ben on it, so it is shared by both.
  await page.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Tasks" }).click();
  const row = page.locator("#tasks-panel article", { hasText: "Fetch the groceries" });
  await row.getByRole("button", { name: /Change who does it/ }).click();
  const picker = row.getByRole("group", { name: "Who does Fetch the groceries" });
  await expect(picker.getByRole("button", { name: "Ben" })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Annie" }).click();
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("Ben & Annie");

  // It now counts as Annie's too.
  await page.getByRole("tab", { name: /^My Tasks/ }).click();
  await expect(page.locator("#tasks-panel article", { hasText: "Fetch the groceries" })).toBeVisible();
});
