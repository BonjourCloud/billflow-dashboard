# Demo account

A shared, resettable account for showing BillWill to customers, friends and family without exposing anyone's real data. Visitors click **Try the demo** and land in a fully populated account; everything they change disappears at the next reset.

## What visitors get

- A **Try the demo** button on the landing page (replacing "View Demo") and an "Or explore the demo account" link on the sign-in page. Nothing to type, nothing to share.
- A banner on every signed-in page: *"Demo account. All data here is sample data, shared with other visitors and reset every day."* with **Reset demo data** and **Exit demo** buttons.
- The demo user is a normal user. It is **never an admin**, even if someone adds it to the admin list or database by mistake.

The buttons appear only when the API has `DEMO_CLERK_USER_ID` set. Without it, the app behaves as before.

## What is in the demo data

Dates are relative to *today*, so the demo always looks current. The numbers are fixed.

| Area | Content |
|---|---|
| **Income** | Salary ₹1,00,000 monthly on the 1st (counted, received for past months); Freelance design work ₹12,000 monthly (listed but **not counted in the plan**, to show irregular income); Diwali bonus ₹20,000 **one-time next month** |
| **Rent and home** | Rent ₹20,000 (5th), Electricity ₹2,800 (**part-paid ₹1,000**), Water & maintenance ₹1,500, Broadband ₹999, Mobile recharge ₹599 |
| **Everyday** | Groceries ₹9,000 in four weekly bills, Fuel ₹4,000, Metro card ₹1,000, Dining out and a family dinner ₹3,500, Health insurance ₹2,400, Gym ₹1,800 |
| **Subscriptions** | Netflix, Spotify, Cloud storage, plus a **cancelled** magazine subscription |
| **Savings** | Mutual fund SIP ₹10,000 and a Recurring deposit ₹5,000 (category type *Savings*, shown as "saved") |
| **Installments** | **Laptop EMI** ₹1,80,000 over 24 months (₹7,500/month, 8 or more paid, active) and **Phone EMI** ₹30,000 over 6 months (all paid, **completed**) |
| **Reminders** | A **Water tanker** bill 3 days overdue and a **Credit card bill** of ₹6,000 due in 2 days, which produce an "overdue" and a "due soon" reminder |
| **Goals** | **School fee fund** ₹1,35,000 over 12 months (₹11,250 a month, on track), **Goa trip** ₹24,000 (₹4,000 a month, **behind plan**), **New phone fund** (**funded**) and **Bike down payment** (**paused**, not in plan) |
| **Future month** | Next month's recurring bills and the Diwali bonus, so month switching and Upcoming have content |
| **Notes and payments** | Several bills have payment history (UPI, card, cash) and a few have notes |
| **Budgets** | Limits on 8 categories chosen to show every status: on track (Groceries, Health), near the limit (Utilities, Transport, Housing, Loans, Savings) and **over** (Entertainment) |
| **Settings** | Needs / wants / savings split 50 / 30 / 20, EMI warning at 40% |

**Typical month, as the Cash Flow card shows it:** income ₹1,00,000; bills and EMIs about ₹63,000 (about 63% of income); saved ₹15,000; goals ₹15,250 (School fee fund and Goa trip); free to spend about ₹6,500; EMI share about 7.5%. Bills and savings together always take at least 50% of income (a test checks this for month starts, month ends, year end and leap day).

## Resetting

| How | When to use |
|---|---|
| **Reset demo data** button in the demo banner | A visitor (or you) wants a clean slate |
| **Reset demo data** card on **Admin → Overview** | Before a presentation, from your admin account |
| Automatic | The first time the demo is opened more than 24 hours after the last reset |
| `npm run seed:demo` | From your computer, needs `MONGODB_URI` and `DEMO_CLERK_USER_ID` in `server/.env` |

A reset deletes **only the demo user's data** and re-creates the sample data in a second or two. A second reset within 10 seconds is declined ("reset a moment ago"). Other users' data is never touched.

## One-time setup

1. **Enable email as an identifier in Clerk (once).** Clerk dashboard → Configure → User & authentication → Email: switch on **Sign-in with email** (and **Sign-up with email** if Clerk requires it). Keep Google as your normal sign-in; an invite-only instance still blocks sign-ups. Without an email identifier Clerk cannot attach one to the demo user, and the demo fails with *"The given token doesn't have an associated identification for the user who created it."*
   **Create the demo user with a verified email.** Users → Create user: first name `Demo`, last name `User`, email `demo+clerk_test@billwill.site`. In a development instance, an address containing `+clerk_test` is a test address: it counts as verified, Clerk never emails it, and no one can receive mail for it. No password is needed, because visitors never type one; the API issues a 60-second one-time sign-in ticket. Use the **same Clerk instance** as the app. A production instance has no `+clerk_test` addresses, so use a real address you control there. A user created without an email cannot be repaired unless email is enabled first; otherwise delete and recreate it (the user id changes, so update `DEMO_CLERK_USER_ID`).
2. **Copy the user id** (`user_…`) from the user's page.
3. **Set `DEMO_CLERK_USER_ID`** to that id: Render → billwill-api → Environment (and `server/.env` locally). Do **not** put the id in `ADMIN_CLERK_USER_IDS`; the server refuses to start with it in both.
4. **Redeploy the API** (Render), then the frontend if it was also changed. The first visit to **Try the demo** creates the data.
5. **Check**: open the site in a private window, click **Try the demo**, and confirm the banner, the Cash Flow card on the dashboard, and **Budget → Income** showing Salary ₹1,00,000.
6. Optional: in Admin → Categories make sure a category of type **Savings** exists. The demo adds "Savings & investments" itself if none does.

## Presenting: a walkthrough that shows every feature

Use a private browser window signed in as the demo, and keep **Admin → Users** off the screen, because it lists real users' emails.

1. **Landing page**: branding, pricing in rupees, **Try the demo**.
2. **Dashboard**: *Monthly Flow* (totals for the month), the **Cash Flow card** (free to spend, income / bills / saved, EMI share), *Upcoming*, the spending chart, *Smart Insights* (rules, no AI).
3. **Bills table**: filter by status and category, **Add Bill** (try a new category), open a bill to see **payment history**, the **part-paid Electricity** bill and a note; record a payment (UPI) and watch it turn Paid.
4. **Reminders**: the bell shows *overdue* (Water tanker) and *due soon* (Credit card bill); mark all read.
5. **Month switcher**: go to next month and show the projected recurring bills and Diwali bonus; go back a month to show history.
6. **Subscriptions**: active list, the cancelled magazine, edit a cost, **Stop Renewals**.
7. **Installments**: the active **Laptop EMI** schedule and remaining balance, the completed **Phone EMI**, and **Create Plan** with the live monthly preview.
8. **Budget → Income**: Salary (counted), Freelance (switch **In plan** on to watch free-to-spend drop and back off), **Mark received**, one-time Diwali bonus next month.
9. **Budget → Budgets**: green / amber / red rows, **Entertainment over by ₹268**, the 50/30/20 summary, edit a limit.
10. **Budget → Goals**: the four goal states, **Add money** to the Goa trip and watch it move toward on track, switch **In plan** off and on for the School fee fund and then go back to the dashboard to see **Free to spend** change, and **Add goal** (the monthly amount is worked out for you).
11. **Log a spend**: tap the round **Log a spend** button (bottom right of any page), enter ₹450 and a note, and watch it appear in the bills list and count against its budget.
12. **Budget → Settings**: change the split (must total 100) and the EMI warning, save.
13. **Light/dark theme** and a **phone-sized window** (the layout is responsive).
14. **Admin** (from your own admin sign-in, not the demo): categories (Need / Want / Savings type, hide instead of delete), pricing, branding, theme, **Reset demo data**.

## Safety notes

- The demo account is **shared and public**: anyone who opens the site can sign in to it and change or delete its data, and what they type (bill names, notes) is visible to the next visitor until the reset. Never enter real personal information. The banner says so.
- The demo user cannot use any admin feature.
- **Try the demo** calls a public endpoint that is rate limited (20 per 15 minutes per IP) and can only ever sign in the demo user. It returns a ticket valid for 60 seconds.
- If the demo ever shows unwanted content, press **Reset demo data**.
- To switch demo mode off, remove `DEMO_CLERK_USER_ID` from Render. The buttons disappear; the demo user's data stays in the database until you delete it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No **Try the demo** button | `DEMO_CLERK_USER_ID` unset, API asleep, or the frontend build is older than the API | Set the variable and redeploy; reload after the API wakes |
| Clicking **Try the demo** shows *"The given token doesn't have an associated identification for the user who created it"* | The demo user has no email address, or email is not enabled as an identifier in Clerk | Enable Sign-in with email, add a verified primary email to the user (or recreate it), as in step 1 |
| Clicking **Try the demo** says "The demo is not available right now" | The id is not a user in this Clerk instance, or the Clerk secret key belongs to another instance | Check the id and instance |
| The API will not start and logs `DEMO_CLERK_USER_ID` | Not of the form `user_…`, or also listed in `ADMIN_CLERK_USER_IDS` | Fix the value |
| Empty dashboard after signing in as the demo | Data not created yet | Open Admin → Overview → **Reset demo data**, or `npm run seed:demo` |
| **Reset** says "a moment ago" | Another reset ran in the last 10 seconds | Wait and retry |
| No "saved" money in the Cash Flow card | No category of type *Savings* | Reset the demo (it adds one) or add one in Admin → Categories |

## How it works (short)

- `server/src/services/demoService.ts` builds the dataset from the current date (`buildDemoDataset`, pure and unit tested) and writes it (`resetDemoData`); `ensureFreshDemo` does the daily refresh.
- Endpoints: `GET /api/demo/status` (public), `POST /api/demo/session` (public, rate limited), `POST /api/demo/reset` (demo user or admin). See [API.md](API.md#demo-account).
- The frontend asks Clerk to sign in with the ticket (`signIn.create({ strategy: 'ticket' })`), then shows the banner when the status says the signed-in user is the demo user.
- `src/test/demo-data.test.ts` checks the dataset on five dates; `src/test/integration/demo.test.ts` checks the endpoints against a real database; a browser journey clicks **Try the demo** and walks the Budget pages.
