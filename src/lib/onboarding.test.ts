import { describe, expect, it } from "vitest";
import {
  checklistTasks,
  offsetLabel,
  parseTemplateItems,
  STARTER_TEMPLATE,
  MAX_TEMPLATE_ITEMS,
} from "./onboarding";

const json = (v: unknown) => JSON.stringify(v);

describe("parseTemplateItems", () => {
  it("rejects anything that isn't a JSON array", () => {
    expect(parseTemplateItems("not json")).toHaveProperty("error");
    expect(parseTemplateItems(json({ title: "x" }))).toHaveProperty("error");
  });

  it("drops blank rows and trims, and needs at least one real step", () => {
    expect(parseTemplateItems(json([{ title: "  " }]))).toEqual({ error: "Add at least one step." });
    const result = parseTemplateItems(json([{ title: "" }, { title: "  Laptop  ", description: " " }]));
    expect(result).toEqual({
      items: [
        {
          title: "Laptop",
          description: null,
          assign_to_new_hire: false,
          assignee_id: null,
          due_offset_days: 0,
        },
      ],
    });
  });

  it("assigning to the new hire overrides any named assignee", () => {
    const result = parseTemplateItems(
      json([{ title: "Read handbook", assign_to_new_hire: true, assignee_id: "p1", due_offset_days: 1 }]),
    );
    expect(result).toMatchObject({ items: [{ assign_to_new_hire: true, assignee_id: null }] });
  });

  it("accepts negative offsets within range and rejects others", () => {
    expect(parseTemplateItems(json([{ title: "Prep", due_offset_days: -30 }]))).toHaveProperty("items");
    expect(parseTemplateItems(json([{ title: "Prep", due_offset_days: -31 }]))).toHaveProperty("error");
    expect(parseTemplateItems(json([{ title: "Review", due_offset_days: 366 }]))).toHaveProperty("error");
    expect(parseTemplateItems(json([{ title: "Review", due_offset_days: 1.5 }]))).toHaveProperty("error");
    expect(parseTemplateItems(json([{ title: "Review", due_offset_days: "abc" }]))).toHaveProperty("error");
  });

  it("caps the number of steps", () => {
    const many = Array.from({ length: MAX_TEMPLATE_ITEMS + 1 }, (_, i) => ({ title: `Step ${i}` }));
    expect(parseTemplateItems(json(many))).toHaveProperty("error");
  });

  it("the starter template is itself valid", () => {
    const result = parseTemplateItems(json(STARTER_TEMPLATE.items));
    expect(result).toEqual({ items: STARTER_TEMPLATE.items });
  });
});

describe("checklistTasks", () => {
  const opts = {
    newHireId: "hire",
    startDate: "2026-03-02",
    activeProfileIds: new Set(["it-person"]),
    createdBy: "admin",
  };

  it("dates each step from the start date, including before day one", () => {
    const tasks = checklistTasks(
      [
        { title: "Accounts", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: -3 },
        { title: "Welcome", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: 0 },
        { title: "30-day review", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: 29 },
      ],
      opts,
    );
    expect(tasks.map((t) => t.due_date.toISOString().slice(0, 10))).toEqual([
      "2026-02-27",
      "2026-03-02",
      "2026-03-31",
    ]);
    expect(tasks.map((t) => t.position)).toEqual([0, 1, 2]);
    expect(tasks[0]).toMatchObject({ type: "general", status: "todo", created_by: "admin" });
  });

  it("gives steps to the new hire, an active named person, or nobody", () => {
    const tasks = checklistTasks(
      [
        { title: "a", description: null, assign_to_new_hire: true, assignee_id: null, due_offset_days: 0 },
        { title: "b", description: null, assign_to_new_hire: false, assignee_id: "it-person", due_offset_days: 0 },
        { title: "c", description: null, assign_to_new_hire: false, assignee_id: "has-left", due_offset_days: 0 },
        { title: "d", description: null, assign_to_new_hire: false, assignee_id: null, due_offset_days: 0 },
      ],
      opts,
    );
    expect(tasks.map((t) => t.assignee_id)).toEqual(["hire", "it-person", null, null]);
  });
});

describe("offsetLabel", () => {
  it("reads naturally", () => {
    expect(offsetLabel(0)).toBe("Start day");
    expect(offsetLabel(-1)).toBe("1 day before");
    expect(offsetLabel(-3)).toBe("3 days before");
    expect(offsetLabel(6)).toBe("Day 7");
  });
});
