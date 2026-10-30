import { Bill } from "../models/Bill.js";
import { RecurringSeries } from "../models/RecurringSeries.js";

export interface DuplicateCandidate {
  name: string;
  amount: number;
  dueDate: Date;
  recurring: boolean;
}

export interface DuplicateMatch {
  name: string;
  amount: number;
  dueDate: Date;
  kind: "bill" | "recurring";
}

// Names match ignoring case and accents ("netflix" == "Netflix").
const NAME_COLLATION = { locale: "en", strength: 1 } as const;

function utcDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Finds an existing entry that looks like the one about to be added.
 * A duplicate is the same name and amount on the same due day, or, for a
 * recurring bill, an active recurring series with the same name and amount.
 */
export async function findDuplicateBill(
  userId: string,
  candidate: DuplicateCandidate,
): Promise<DuplicateMatch | null> {
  const name = candidate.name.trim();
  const { start, end } = utcDayRange(candidate.dueDate);

  const sameBill = await Bill.findOne({
    userId,
    name,
    amount: candidate.amount,
    dueDate: { $gte: start, $lt: end },
  })
    .collation(NAME_COLLATION)
    .select("name amount dueDate")
    .lean();

  if (sameBill) {
    return {
      name: sameBill.name,
      amount: sameBill.amount,
      dueDate: sameBill.dueDate,
      kind: "bill",
    };
  }

  if (!candidate.recurring) return null;

  const sameSeries = await RecurringSeries.findOne({
    userId,
    name,
    amount: candidate.amount,
    isActive: true,
  })
    .collation(NAME_COLLATION)
    .select("name amount startDate")
    .lean();

  return sameSeries
    ? {
        name: sameSeries.name,
        amount: sameSeries.amount,
        dueDate: sameSeries.startDate,
        kind: "recurring",
      }
    : null;
}
