import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { mongoose } from "../../../server/src/index";
import { Notification } from "../../../server/src/models/Notification";
import { convertLegacyReminderCurrency } from "../../../server/src/services/reminderService";

const ALICE = "user_alice";
const BOB = "user_bob";
const DAY = 24 * 60 * 60 * 1000;

describe("Reminders saved before the rupee change", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
    registerClerkUser({ id: ALICE, email: "alice@example.com" });
    registerClerkUser({ id: BOB, email: "bob@example.com" });
  });

  // Inserted directly, bypassing timestamps, as rows saved by the old code.
  async function insertLegacy(
    userId: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    const createdAt = new Date(Date.UTC(2026, 9, 1, 9, 0, 0));
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      billId: new mongoose.Types.ObjectId(),
      type: "overdue",
      title: "Payment Overdue: Rent",
      message,
      amount: 210759,
      dueDate: new Date(Date.now() - 3 * DAY),
      isRead: false,
      isDismissed: false,
      createdAt,
      updatedAt: createdAt,
      ...extra,
    };
    await Notification.collection.insertOne(doc);
    return doc;
  }

  it("shows old dollar reminders in rupees without changing anything else", async () => {
    const unread = await insertLegacy(ALICE, "$210,759.00 was due on 2026-10-18 (3 days overdue).");
    const read = await insertLegacy(ALICE, "$1,499.00 is due tomorrow (2026-10-21).", {
      type: "due_soon",
      isRead: true,
    });
    const dismissed = await insertLegacy(ALICE, "$759.00 is due today (2026-10-20).", {
      type: "due_soon",
      isDismissed: true,
    });
    const current = await insertLegacy(ALICE, "₹640.00 is due in 2 days (2026-10-23).", {
      type: "due_soon",
    });
    const bobs = await insertLegacy(BOB, "$99.00 is due today (2026-10-20).");

    const res = await harness.request<Array<{ _id: string; message: string }>>(
      "GET",
      "/api/notifications",
      { user: ALICE },
    );
    expect(res.status).toBe(200);
    const shown = Object.fromEntries(res.body.map((n) => [n._id, n.message]));
    expect(shown[String(unread._id)]).toBe("₹2,10,759.00 was due on 2026-10-18 (3 days overdue).");
    expect(shown[String(read._id)]).toBe("₹1,499.00 is due tomorrow (2026-10-21).");
    expect(shown[String(current._id)]).toBe("₹640.00 is due in 2 days (2026-10-23).");
    expect(JSON.stringify(res.body)).not.toContain("$");

    // History is kept and only the message text changed.
    expect(await Notification.countDocuments({ userId: ALICE })).toBe(4);
    const stored = await Notification.findById(dismissed._id).lean();
    expect(stored?.message).toBe("₹759.00 is due today (2026-10-20).");
    expect(stored).toMatchObject({
      isDismissed: true,
      isRead: false,
      type: "due_soon",
      title: "Payment Overdue: Rent",
      amount: 210759,
    });
    expect(stored?.createdAt).toEqual(dismissed.createdAt);
    expect(stored?.updatedAt).toEqual(dismissed.updatedAt);
    expect((await Notification.findById(read._id).lean())?.isRead).toBe(true);

    // Another user's reminders are untouched until they load their own.
    expect((await Notification.findById(bobs._id).lean())?.message).toBe(
      "$99.00 is due today (2026-10-20).",
    );
  });

  it("is idempotent and safe under concurrent loads", async () => {
    await insertLegacy(ALICE, "$210,759.00 was due on 2026-10-18 (3 days overdue).");
    await insertLegacy(ALICE, "$1,499.00 is due tomorrow (2026-10-21).", { type: "due_soon" });

    const results = await Promise.all([
      convertLegacyReminderCurrency(ALICE),
      convertLegacyReminderCurrency(ALICE),
      harness.request("GET", "/api/notifications", { user: ALICE }),
    ]);
    const converted = (results[0] as number) + (results[1] as number);
    expect(converted).toBeLessThanOrEqual(2);
    expect(await convertLegacyReminderCurrency(ALICE)).toBe(0);

    const messages = (await Notification.find({ userId: ALICE }).lean()).map((n) => n.message).sort();
    expect(messages).toEqual([
      "₹1,499.00 is due tomorrow (2026-10-21).",
      "₹2,10,759.00 was due on 2026-10-18 (3 days overdue).",
    ]);
  });
});
