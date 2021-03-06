import {
  restore,
  signInAsAdmin,
  popover,
  openOrdersTable,
  openReviewsTable,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

// test various entry points into the query builder

describe("scenarios > question > new", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  describe("browse data", () => {
    it("should load orders table and summarize", () => {
      cy.visit("/");
      cy.contains("Browse Data").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();
      cy.contains("37.65");
    });
  });

  describe("ask a (simple) question", () => {
    it("should load orders table", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Simple question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();
      cy.contains("37.65");
    });

    it.skip("should handle (removing) multiple metrics when one is sorted (metabase#13990)", () => {
      cy.request("POST", "/api/card", {
        name: "12625",
        dataset_query: {
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["count"],
              ["sum", ["field-id", ORDERS.SUBTOTAL]],
              ["sum", ["field-id", ORDERS.TOTAL]],
            ],
            breakout: [
              ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"],
            ],
            "order-by": [["desc", ["aggregation", 1]]],
          },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: QESTION_ID } }) => {
        cy.server();
        cy.route("POST", `/api/card/${QESTION_ID}/query`).as("cardQuery");
        cy.route("POST", `/api/dataset`).as("dataset");

        cy.visit(`/question/${QESTION_ID}`);

        cy.wait("@cardQuery");
        cy.get("button")
          .contains("Summarize")
          .click();

        // CSS class of a sorted header cell
        cy.get("[class*=TableInteractive-headerCellData--sorted]").as(
          "sortedCell",
        );

        // At this point only "Sum of Subtotal" should be sorted
        cy.get("@sortedCell")
          .its("length")
          .should("eq", 1);
        removeMetricFromSidebar("Sum of Subtotal");

        cy.wait("@dataset");
        cy.findByText("Sum of Subtotal").should("not.exist");

        // "Sum of Total" should not be sorted, nor any other header cell
        cy.get("@sortedCell")
          .its("length")
          .should("eq", 0);

        removeMetricFromSidebar("Sum of Total");

        cy.wait("@dataset");
        cy.findByText(/No results!/i).should("not.exist");
        cy.contains("744"); // `Count` for year 2016
      });
    });

    it.skip("should remove `/notebook` from URL when converting question to SQL/Native (metabase#12651)", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");
      openOrdersTable();
      cy.wait("@dataset");
      cy.url().should("include", "question#");
      // Isolate icons within "QueryBuilder" scope because there is also `.Icon-sql` in top navigation
      cy.get(".QueryBuilder .Icon-notebook").click();
      cy.url().should("include", "question/notebook#");
      cy.get(".QueryBuilder .Icon-sql").click();
      cy.findByText("Convert this question to SQL").click();
      cy.url().should("include", "question#");
    });

    it.skip("should display date granularity on Summarize when opened from saved question (metabase#11439)", () => {
      // save "Orders" as question
      cy.request("POST", "/api/card", {
        name: "11439",
        dataset_query: {
          database: 1,
          query: { "source-table": ORDERS_ID },
          type: "query",
        },
        type: "query",
        display: "table",
        visualization_settings: {},
      });
      // it is essential for this repro to find question following these exact steps
      // (for example, visiting `/collection/root` would yield different result)
      cy.visit("/");
      cy.findByText("Ask a question").click();
      cy.findByText("Simple question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("11439").click();
      cy.findByText("Summarize").click();
      cy.findByText("Group by")
        .parent()
        .within(() => {
          cy.log("**Reported failing since v0.33.5.1**");
          cy.log(
            "**Marked as regression of [#10441](https://github.com/metabase/metabase/issues/10441)**",
          );
          cy.findByText("Created At")
            .closest(".List-item")
            .contains("by month")
            .click();
        });
      // this step is maybe redundant since it fails to even find "by month"
      cy.findByText("Hour of day");
    });

    it.skip("should display timeseries filter and granularity widgets at the bottom of the screen (metabase#11183)", () => {
      cy.request("POST", "/api/card", {
        name: "11183",
        dataset_query: {
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["sum", ["field-id", ORDERS.SUBTOTAL]]],
            breakout: [
              ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
            ],
          },
          type: "query",
        },
        display: "line",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.server();
        cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

        cy.visit(`/question/${QUESTION_ID}`);
      });

      cy.wait("@cardQuery");
      cy.log("**Reported missing in v0.33.1**");
      cy.get(".AdminSelect")
        .as("select")
        .contains(/All Time/i);
      cy.get("@select").contains(/Month/i);
    });
  });

  describe("ask a (custom) question", () => {
    it("should load orders table", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();
      cy.contains("Visualize").click();
      cy.contains("37.65");
    });

    it("should allow using `Custom Expression` in orders metrics (metabase#12899)", () => {
      openOrdersTable({ mode: "notebook" });
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();
      popover().within(() => {
        cy.get("[contentEditable=true]").type("2 * Max([Total])");
        cy.findByPlaceholderText("Name (required)").type("twice max total");
        cy.findByText("Done").click();
      });
      cy.findByText("Visualize").click();
      cy.findByText("604.96");
    });

    it.skip("should keep manually entered parenthesis intact (metabase#13306)", () => {
      const FORMULA =
        "Sum([Total]) / (Sum([Product → Price]) * Average([Quantity]))";

      openOrdersTable({ mode: "notebook" });
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();
      popover().within(() => {
        cy.get("[contentEditable=true]")
          .type(FORMULA)
          .blur();

        cy.log("**Fails after blur in v0.36.6**");
        // Implicit assertion
        cy.get("[contentEditable=true]").contains(FORMULA);
      });
    });

    it.skip("distinct inside custom expression should suggest non-numeric types (metabase#13469)", () => {
      openReviewsTable({ mode: "notebook" });
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();

      cy.get("[contentEditable=true]")
        .click()
        .type("Distinct([R");

      cy.log(
        "**The point of failure for ANY non-numeric value reported in v0.36.4**",
      );
      // the default type for "Reviewer" is "No special type"
      cy.findByText("Fields")
        .parent()
        .contains("Reviewer");
    });
  });
});

function removeMetricFromSidebar(metricName) {
  cy.get("[class*=SummarizeSidebar__AggregationToken]")
    .contains(metricName)
    .parent()
    .find(".Icon-close")
    .should("be.visible")
    .click();
}
