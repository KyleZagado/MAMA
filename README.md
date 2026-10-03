# MAMA

MAMA is an Expo app for iOS and Android. It includes Supabase email/password
sign-in, personal-finance tracking, and fitness tools. Finance data is entered
manually; no bank accounts or financial institutions are connected. Finance
records, budgets, bills, and fitness schedules are stored locally on each
signed-in user's device. Fitness includes a workout scheduler with day, week,
and month views, recurring workouts and rest days, reminders, and workout history.
The home carousel also includes a fasting tracker with timed protocols, custom
fast durations, session history, and a separate 5:2 weekly check-in.

## Fasting tracker

Swipe to **Fasting Tracker** from the home carousel. Choose a 12:12, 14:10,
16:8, 18:6, 20:4, OMAD, 24-hour, 36-hour, 48-hour, or custom fast and start
the timer. Active sessions and recent history are saved locally for the signed-in
user. Custom fasts support durations from 1 to 72 hours. The 5:2 option tracks
two reduced-intake day check-ins per Monday–Sunday week; it is treated as a
weekly eating pattern rather than a fixed-hour fast. Fasting is not suitable for
everyone; seek healthcare advice before trying extended fasts.

During a fast, switch between elapsed-time count-up and remaining-time
countdown, pause/resume, end or cancel, and adjust the goal in 30-minute steps.
Edit active start/planned-end times or correct the start/end times of a completed
session. The timer shows goal progress, a timeline, current phase, daily status,
and the next eating/fasting window based on the selected protocol. Eating-window
and phase estimates are informational and do not provide medical guidance.

## Home page sequence

Use **Profile → Home page sequence** to move any main page earlier or later,
send it directly to the first or last position, or restore the default order.
The setting is saved per signed-in user on the device.

## Quick expense entry

Use **Add Expense** on the finance dashboard. Enter an amount, choose a category
and wallet, and save; the date and time default to now. Merchant is optional.
Expand **Add optional details** for subcategory, notes, a manually entered
location, payment method, receipt photo, and comma-separated tags. Receipts are
copied into persistent app storage. Tap an entry in **Transactions** to see its
details and receipt. Uncategorised expenses are saved under **Other**.
Logging a savings contribution as an expense reduces the wallet balance and
counts as spending; use a transfer instead when moving money between your wallets.

## Multiple accounts / wallets

Create separate wallets for bank accounts, e-wallets, cash, credit cards, and
other accounts. Tap a wallet on the dashboard or in **Manage Wallets** to open
its detail screen. Each wallet shows its own current balance, all-time income,
expenses, transfers in/out, and paginated transaction history. Filter history by
Income, Expenses, or Transfers. Incoming and outgoing transfers appear in both
wallets with the appropriate direction; transfers are not income or expenses.
Deleted transactions are excluded, and opening balances are separate from
activity totals.

Wallet-specific **Add Expense**, **Add Income**, and **Transfer** actions
preselect that wallet. Tap a history entry to see details or delete it; deleting
a transfer reverses its impact on both wallets. **Edit wallet** retains existing
balance adjustment and deletion behavior.

## Income sources and pay schedules

Open **Income & pay schedules** on the finance dashboard. **Add Income** records
one-off payments under Salary, Freelance, Business, Allowance, Commission,
Investments, Gifts, or Other. Optional descriptions distinguish individual sources.
The income screen shows received monthly and calendar-year totals, category
breakdowns, and paginated income history. Income totals are kept separate by wallet
currency (no exchange-rate conversion). Select a month and tap a history entry
to view details or delete it.

Add recurring income with a source name, amount **per payment**, category, wallet,
and start date. Each source can have its own weekly, every-two-weeks, monthly,
twice-monthly, or annual schedule. Twice-monthly defaults to the Philippine
**15th + 30th** salary schedule, with editable pay days. Days beyond a month's
length fall on its last day (February 28 or 29 for the 30th). Twice-monthly
pay days that overlap in February are rejected; use two monthly schedules instead
so neither payment is lost. For unequal paychecks, create two monthly schedules
with separate amounts. Weekly and
every-two-weeks schedules are anchored to the start date, not month boundaries.

Expected payments never change wallet balances. On or after a due date, choose
**Confirm received**, verify the actual amount and receipt date, and record it
once. The actual receipt date determines income totals, even for late payments.
Use Previous / Next to see upcoming months or confirm missed payments. Removing
a schedule preserves recorded income; deleting a received income transaction
reverses its balance impact and lets that payment be confirmed again. Data stays
in the signed-in user's local database.

## Core To-Do tools

The To-Do home keeps its quick task composer. Choose **New detailed task** for
title, description/notes, due date and due time, start/end times, all-day mode,
Low/Medium/High priority, To Do/In Progress/Done status, checklist items, photo
attachments, HTTP/HTTPS links, tags, custom categories, color labels, manually
entered location, estimated duration, and actual time spent (both in minutes).
All-day tasks clear clock times when saved; timed tasks use local times on the
due date. End time must be later than start time. Photo selection and camera
capture are supported; camera capture requires a physical device.

Tap a task title or options button to edit it. Changes to checklist items and
fields are saved with **Save task changes**. The editor also offers duplicate,
archive/unarchive, and delete actions on the last saved version. Duplicates
preserve metadata and photos but reset status, checklist completion, and actual
time spent.

Open **Manage tasks / Bulk / Drag** for Day, All tasks, or Archived views.
Use the checkbox to complete/uncomplete; use **Edit** to set In Progress.
**Move / reschedule** works on any date and preserves task times and details.
Drag the grip to one of the seven visible date cells to move a task, or drop it
above/below another card in unfiltered Day view to reorder the day. Dragging
does not auto-scroll; use the date picker/week controls or Move for distant
dates. **Bulk select** supports selecting shown tasks and completing, deleting,
or rescheduling the selection in a single atomic action.

**Undo** on the To-Do home or task manager restores the most recent task action,
including creation, edits, completion, duplication, archival, deletion, moving,
reordering, and bulk actions. Up to 20 actions persist locally across app
restarts; undo refuses to overwrite newer external changes. Archived tasks
stay out of the home and widget lists. Photos are copied to persistent storage
and retained when removed/archived/deleted so undo and duplicated tasks can
still display them. Location and actual time spent are manual fields, not GPS
tracking or an automatic timer.

## Task lists and grouping

Open **Lists / Group tasks** from To-Do or Manage Tasks for All tasks, Today,
Tomorrow, Upcoming, Overdue, Completed, Unscheduled, Favorites, and My Lists.
Today, Tomorrow, Upcoming, and Overdue show unfinished tasks; the other views
can include completed tasks. Upcoming starts tomorrow. Overdue includes passed
deadlines today and earlier scheduled dates, not unscheduled tasks.

Group any view by Date, Priority (high first), Category, Project, Tag, Status,
Time (morning/afternoon/evening or all-day/no time), or Location. Tasks with
multiple tags appear under each tag; the view count counts distinct tasks.
Search covers titles, notes, categories, projects, lists, tags, and locations.

The task editor supports a favorite flag, one named list, a separate project,
and a **Scheduled date** switch. Unscheduled tasks stay out of the home,
widgets, and calendar until scheduled; they remain editable in All tasks,
Unscheduled, and Manage Tasks. Recurring tasks/occurrences must retain a date.
Create persistent empty lists from My Lists, or type a new list name in the
editor. Favorites and completion can be toggled directly in the list browser,
including individual recurring occurrences, and support task undo.
Recurring list entries use the same 30-day-back/one-year-ahead window as home;
use Calendar for recurring dates outside that window. One-off tasks are not
date-window limited. Existing task data and undo history survive the upgrade.

## To-Do calendar

Open **Calendar** from the To-Do home or task manager. Switch between Month,
Week, Day, Agenda (31 days from the selected date), Timeline (a 24-hour time
grid), and Year overview. Tap a date to see its tasks; tap an entry to open
its editor/details. Use Today, the date picker, arrows, or a horizontal swipe
on calendar content to navigate. Current-day borders, colored task markers,
completion checkboxes, and recurring labels distinguish tasks. Colors use a
task's chosen label first, then red/high, amber/medium, or blue/low priority.
Completed, recurring, and overdue task visibility have independent switches.
All overdue one-off tasks are shown, including passed deadlines today;
unedited recurring overdue instances use
a rolling 30-day window. Select older dates to view earlier recurring instances.

Drag a task grip onto a visible date cell to move it without changing its
times. In Timeline view, drag onto a time to set the start in 15-minute steps,
preserving duration and shifting the due time by the same amount. All-day tasks
become timed with a 30-minute duration when dropped on a time. Drag the resize
grip on a task with a start time to adjust its end time and estimated duration.
The task editor remains available for exact times. Drops that would shift a
task or its due time beyond the day are rejected explicitly. Dragging does not
auto-scroll: scroll to the desired time first or use the editor for distant
times. Overlapping timeline tasks occupy separate columns; short tasks have
a minimum visual size for their controls, with exact times shown in the label.

The task editor now supports Daily, Weekly on selected weekdays, and Monthly
repeat rules. A monthly task on the 31st uses the last day of shorter months.
The due date anchors the series. Calendar completion, moving, resizing, and
editing apply to one occurrence; **Edit repeat series** changes the template
for unedited dates. Saved exceptions keep their own dates, times, status,
checklists, and attachments. Archive/delete a series in Manage Tasks to hide
all its occurrences; archive/delete an individual saved occurrence to hide
just that date. Undo restores calendar changes and previously existing undo
history survives the calendar database upgrade. The To-Do home and widget
expand recurring tasks from 30 days ago through one year ahead.
Manage Tasks lists repeat templates separately; use Calendar to complete
individual recurring dates rather than bulk-completing a repeat template.

## Configure Supabase

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Enable Email authentication and choose whether new accounts require email
   confirmation.
3. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` to your project's URL and anon/publishable
   key.
4. Start the app with `npx expo start`.

The anon/publishable key is intended for client apps. Never put a Supabase
service-role key in the app. Before storing financial records, enable
Row-Level Security and add policies that restrict every record to its owner.

For EAS builds, add the same two `EXPO_PUBLIC_` variables to the EAS
environment used by the build. Do not commit `.env` or credentials.

## Checks

```sh
npm run lint
npx tsc --noEmit
npx expo-doctor
node --test tests/finance.test.cjs tests/tasks.test.cjs tests/calendar.test.cjs tests/task-organization.test.cjs
```

The finance regression tests use Node's built-in SQLite module (Node 22.13+
or a newer supported LTS release) to check migrations, persisted expense details,
historical timestamps, income/transfer behavior, pay-date recurrence, confirmation
deduplication, and complete monthly/annual totals. Task tests cover the schema
upgrade, all metadata, single/bulk actions, persistent ordering, undo, validation,
and preservation of existing tasks. Calendar tests cover view ranges, navigation,
daily/weekly/monthly recurrence, occurrence exceptions, time dragging/resizing,
and undo preservation during upgrades.
