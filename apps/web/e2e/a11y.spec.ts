import AxeBuilder from "@axe-core/playwright";
import { expect, test, waitForHydration } from "./fixtures";

const PATHS = [
  "/",
  "/pachete-anti-risipa",
  "/?oferta=00000000-0000-0000-0000-00000000b001",
  "/zona/titan/pachete-anti-risipa",
  "/?q=covrigi&km=oras",
];

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const path of PATHS) {
      test(`${path} has no accessibility violations`, async ({ page }) => {
        await page.goto(path);
        await waitForHydration(page);
        const results = await new AxeBuilder({ page }).exclude(".leaflet-tile-pane").analyze();
        const violations = results.violations.map(
          (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`,
        );
        expect(violations).toEqual([]);
      });
    }
  });
}
