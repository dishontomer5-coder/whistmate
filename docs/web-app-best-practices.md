# Web app best practices

How to build and ship a small web app well, written from one project's mistakes.

## Contents

1. [How to use this guide](#1-how-to-use-this-guide)
2. [Structure and navigation](#2-structure-and-navigation)
3. [Flows](#3-flows)
4. [States](#4-states)
5. [Wording](#5-wording)
6. [Visual design](#6-visual-design)
7. [Phones first](#7-phones-first)
8. [Accessibility](#8-accessibility)
9. [Data access and privacy](#9-data-access-and-privacy)
10. [Accountability](#10-accountability)
11. [Testing](#11-testing)
12. [Shipping](#12-shipping)
13. [Working with AI agents on a build like this](#13-working-with-ai-agents-on-a-build-like-this)
14. [A one-page checklist](#14-a-one-page-checklist)

## 1. How to use this guide

This guide is for a person deciding how to build a small web app and for the AI agents who build it: a single-page app (one page of code that draws every screen in the browser) on a hosted backend platform (a service providing sign-in, storage and server functions), used mostly on phones by small groups. Each practice says what to do, gives a five-minute **Check**, and tells the lesson that earned it.

The lessons come from WhistMate, a scorekeeper for the card game Israeli Whist, ported from a poker app onto the Base44 platform and built largely by AI agents for one owner. A *group* plays *sessions* (one evening) made of *rounds* (one hand), in which four players *bid* and then *take* tricks. In November 2026 six independent reviewers reported 138 findings, a verifier reduced them to 86 problems, and the lead (the coordinating agent) wrote a ruling on each. The fixes were still in progress when this was written and no second review had run, so lessons report what was found and decided. Platform facts are dated; test them on your own platform.

## 2. Structure and navigation

### 2.1 Name each tab for what is inside it

A label and icon should let a user predict the content.

**Check:** Read the labels, guess what is behind each, then open them.

**WhistMate lesson:** "Sessions" held standings and awards, and the session list sat under "History" with a trophy icon, inherited unexamined from the poker app. The ruling renames the tabs and keeps their addresses.

### 2.2 Give each page one back control

One labelled control returns to where the user came from.

**Check:** Reach a page by two routes; Back must return to each start.

**WhistMate lesson:** Group pages had two stacked arrows. The upper, 16 px and unlabelled, left the group; the lower went to a fixed page, so a profile opened from the activity feed went "back" to History.

### 2.3 Take the context from the address or the loaded record

Which group or account a page belongs to must come from its address or its own data. A value remembered in browser storage goes stale when a link or the Back button opens another page.

**Check:** With group A last used, open a link into group B; header, buttons and role must be B's.

**WhistMate lesson:** The current group was an id in browser storage. One group's session opened under another's name with admin buttons the user did not hold there (the server refused the writes), and after leaving a group, Back stuck on the groups list. The ruling derives the group from the page's data, since an id in the address would have broken shared links; a new app should put it there from the start.

## 3. Flows

### 3.1 Make the first run lead somewhere

The page a newcomer was headed for must survive sign-up, and an empty account must say what to do.

**Check:** In a private window, open an invitation, sign up, and count your guesses.

**WhistMate lesson:** After signing up, an invited person landed on "No groups yet", because sign-in always returned to the home page. A new group's owner learned that a round needs four players only three taps into starting one.

### 3.2 Build the core task for the conditions it is done in

Describe where the main task really happens (one hand, noise, hurry) and test it that way, in the order the real world uses.

**Check:** Do the task ten times running, one-handed, on a phone.

**WhistMate lesson:** The scorekeeper holds the phone in one hand while three players wait. After each bid the cursor jumped to the first empty row instead of the next player, so bidding could not start from any seat.

### 3.3 Never lose typed work

Keep unsaved input as a draft in the browser; a warning on leaving does not survive a reload.

**Check:** Half-fill the main form, reload, go back and forward; nothing may be lost.

**WhistMate lesson:** Unlocked bids and unsaved tricks vanished when the scorer left or reloaded, and "Edit bids" then Cancel wiped the tricks under a notice promising they were untouched.

### 3.4 Give every step a way back

Every step that commits something needs its reverse: edit, discard or cancel.

**Check:** After each commit point, try to undo it as an ordinary user.

**WhistMate lesson:** A round started with the wrong players could not be discarded, and while it existed "Close Session" silently disappeared. The server allowed the delete; no screen offered it.

### 3.5 Say why a control is off, and show the result before saving

Put the missing condition beside a disabled button, and show what saving will compute (a score, a charge) during entry, using the server's code.

**Check:** Disable each button every way you can; enter each special case.

**WhistMate lesson:** In sessions with advanced rules, "Lock Bids" stayed disabled until a trump suit and card order were chosen, and the screen named neither. One tap on a 57×19 px "RENEGE" pill (a rule breach) cost a player 100 points; only its colour changed, and the −100 appeared after saving.

## 4. States

### 4.1 Wait for the data before choosing defaults

Apply a form's defaults when the data arrives, unless the user has touched the field.

**Check:** Reload directly on each form; defaults must match those seen after navigating.

**WhistMate lesson:** After a reload the new-session form chose its scoring method before the group had loaded, so a group defaulting to Progressive got a Classic session. Session rules are frozen at the start, so it could not be undone.

### 4.2 Make an empty state point to the next step

An empty list says what belongs there and offers the action that fills it.

**Check:** With a fresh account, every empty screen must say what to do.

**WhistMate lesson:** A new session showed two near-identical empty blocks, one saying "Play a session to see standings" inside a session. The designer counted five looks for empty and error states.

### 4.3 Tell "nothing here" from "failed", "missing" and "offline"

Each needs its own message. Offer "Try again" only when retrying can help.

**Check:** Open a made-up id, save offline, and make the server refuse a read; compare each with a truly empty screen.

**WhistMate lesson:** For five minutes after one deploy the old page ran against newly locked data and showed empty lists, because on this platform a refused read returns no rows. A missing session offered "Try Again". Saving offline showed "Network Error"; the ruling's wording is "Couldn't reach the server — nothing was lost. Try again."

### 4.4 Show read-only as read-only

Hide write controls on anything archived or locked, and enforce the rule on the server.

**Check:** Archive something, then visit every screen that could change it.

**WhistMate lesson:** An archived group still offered every write action. The server refused each one, but only after the form was filled in.

### 4.5 Put feedback where the action happened

Show an error beside the control that caused it, and confirm a success.

**Check:** Cause an error on the lowest control of a long page; it must be visible.

**WhistMate lesson:** A rename error was drawn 144 px above the top of the screen while the editor sat 650 px down. A successful "Save Settings" showed nothing.

## 5. Wording

### 5.1 Use one word per thing, and make it the user's word

Write a vocabulary before the screens, and keep symbols and internal names off them.

**Check:** Search the source for each retired word.

**WhistMate lesson:** "Games" meant rounds on one screen and sessions on another, and a hint read "4 blocked (would make Σ=13)". Four months after the port, the public invitation page still said "track your poker nights".

### 5.2 Define each number once and explain it where it is shown

Write each statistic's definition with its edge cases (unfinished periods, ties, nothing to count), and explain it within a tap of the number.

**Check:** Recompute two displayed numbers by hand.

**WhistMate lesson:** Standings showed 15 wins for 14 finished sessions, because the leader of the session in play was credited a win. A player who had never bid zero showed "0%" success, like one who tried and failed.

### 5.3 Let typed text keep its own direction

Isolate a typed name inside a sentence (HTML `<bdi>`) and let free text pick its direction (`dir="auto"`).

**Check:** Enter a Hebrew or Arabic name; view every screen showing it.

**WhistMate lesson:** With a Hebrew name, "Bid for [name] · 4 blocked" was drawn "Bid for 4 · [name] blocked", because digits after right-to-left text join its run. Reviewers saw it because four of the seven players in the test data had Hebrew names.

### 5.4 Treat a calendar date as a day

A date without a time is a day on the user's calendar: send the local date from the form.

**Check:** Just after local midnight, save a record with the date left blank.

**WhistMate lesson:** At 01:12 local time a session with a blank date was saved as the previous day, because the server took the day from UTC.

## 6. Visual design

### 6.1 One meaning per colour

Write down what each colour means.

**Check:** List where each colour appears; two meanings is a finding.

**WhistMate lesson:** Red meant a lost score and also an "UP" table, a neutral fact; gold marked gains, zeros and one −600. The ruling: gained gold, zero muted, lost red, the table badge neutral.

### 6.2 Measure contrast

Compute text contrast against its real background (4.5:1 for body-size text).

**Check:** Run a contrast script over each screen's computed styles.

**WhistMate lesson:** The red used for negative scores and errors measured 3.30:1 and 3.46:1 on navy, while muted and gold text passed at 6.2:1 and above. The ruling adds a lighter red (#F87171, about 5.3:1) for text.

### 6.3 Set a type floor

Fix the smallest size that may carry information.

**Check:** Search the styles for sizes below the floor.

**WhistMate lesson:** Tab labels and the renege control were 10 px and an unread badge 9 px. The ruling's floor is 12 px.

### 6.4 One component per job

Build confirmation, empty state, error, avatar and badge once, before the screens that use them.

**Check:** Trigger every destructive action and compare the confirmations.

**WhistMate lesson:** Destructive actions were confirmed in four different ways and three not at all: one tap replaced the invite code, with no word that links already sent would stop working.

### 6.5 Make the store icon and the app one product

The icon people tap and the first screen should share a mark, a palette and a name.

**Check:** Put the listing icon beside a screenshot of the first screen.

**WhistMate lesson:** The listing icon was a painted jester; the app showed a flat yellow spade tile. The artwork is the owner's, and the choice between it and an alternative drawn from the in-app mark was still open.

## 7. Phones first

### 7.1 Make every touch target at least 44 px

Measure the tappable area, and measure again after the fix.

**Check:** At 390 px wide, list every control under 44×44 px with a script.

**WhistMate lesson:** Number keys were 42 px, primary buttons 36 px high, the renege control 19 px and the back arrow 16 px. Re-measuring after the first fix found three more kinds under 44 px.

### 7.2 Keep the primary action in view on the smallest phone

The button that finishes a step must be visible without scrolling, uncovered by fixed bars, down to 320 px wide. On desktop, an app made for phones only has to work.

**Check:** At 375×667 finish each step without scrolling; at 320 px and 1440 px look for horizontal scrolling.

**WhistMate lesson:** At 390×844, marking a trump winner pushed "Lock Bids" to 782.6 px, exactly behind a tab bar starting at 782.5 px; the ruling hides the tab bar during round entry. At 320 px the number pad began below the screen and the admin page was 364 px wide. Desktop shows a phone-width column, judged acceptable.

### 7.3 Test on a real phone what a desktop browser cannot show

Safe areas (the strips a phone reserves for its notch and home indicator), the on-screen keyboard and sticky hover exist only on devices.

**Check:** On a phone, use every form with the keyboard up.

**WhistMate lesson:** The reviewers' browser was desktop Chrome at phone size; its documentation says it does not reproduce safe areas or the keyboard, so those checks are still owed. It did catch a tapped button that kept its hover style.

## 8. Accessibility

### 8.1 Name every icon-only control

Give icon buttons an accessible name (what a screen reader announces, set with `aria-label`).

**Check:** List the page's controls with their accessible names.

**WhistMate lesson:** The reviewers' browser tool listed controls by name, so the gaps showed as "(no label)": the back arrow, the copy-code button, every switch. No real screen-reader test is recorded.

### 8.2 Show state and focus, and never by colour alone

A toggle announces whether it is on (`aria-pressed`), a state shown by colour gets a second signal, and the focus ring contrasts with its control.

**Check:** View each screen in greyscale, then tab through it.

**WhistMate lesson:** Switching the renege control on changed only its colour and exposed no state. UP and DOWN differed by red and green alone. The focus ring was 1 px of gold around gold buttons.

## 9. Data access and privacy

### 9.1 Close everything; read and write through server functions

Treat the browser as hostile: anyone can call the data API with their own code. Deny every table by default (such access rules are often called row-level security) and serve screens through server functions that check the caller.

**Check:** Signed out, request each table from the data API with `curl`.

**WhistMate lesson:** An audit of the live site found that anyone, signed out, could read every group's names, scores and invite codes. Five tables had `read: true`, inherited from the poker app with a comment that scoping was "enforced in functions", while the screens read the tables directly. Every rule on those tables is now `false`, and a test fails if one is opened.

### 9.2 Decide access from the stored record

Look up the record and check the caller against it. An id in the request is a wish, and a hidden button is not a permission.

**Check:** As a signed-in stranger, call each function with another group's ids.

**WhistMate lesson:** A statistics function trusted the group id in the request, so a member of one group could fetch another group's player. Deleting a round was hidden from non-admins on screen and allowed to them by the server.

### 9.3 Test what the platform guarantees

List the platform behaviours your security rests on and attack each on a throwaway app.

**Check:** With a plain test account, try to change your own role.

**WhistMate lesson:** On Base44 in November 2026 a signed-in user could become app administrator by updating the `role` field of their own user record; a throwaway app accepted the call. Every administrator check assumed that was impossible. A field-level rule now reserves `role` for administrators, verified on the test app and then on the live app. The live app had six users and one administrator, so the hole had not been used.

### 9.4 Treat any cache the user can write as a hint

A copy of access data (your groups, your role) stored where the user's own sign-in can write may say anything. Use it only to find the real record, then re-read that on the server.

**Check:** With a plain account, forge a cache entry and call every function.

**WhistMate lesson:** Each user's groups were cached on their own user record, to cover the moment after joining when the membership query still returns nothing. The profile-update call could write that cache with any group and `role: 'admin'`, and three read functions and 18 write functions took it as proof.

### 9.5 Never decide from one page of rows

Code that counts, sweeps or deletes "all rows" must loop to the last page of results, or refuse.

**Check:** Seed more rows than a page holds and compare totals with a hand count.

**WhistMate lesson:** On Base44 in November 2026 a query returned at most 500 rows whatever limit was asked (measured by this project's code). Screens asking for 5,000 got 500, so standings were silently cut past about 125 rounds, and a cleanup job would have deleted valid notes once the member table passed 500 rows.

### 9.6 Send only what the screen needs

Strip secrets on the server, and add no public endpoint for convenience.

**Check:** Read raw responses in the network panel for fields no screen shows.

**WhistMate lesson:** The invitation page wanted to name the group for signed-out visitors. A public "name for this code" lookup was rejected because it would test invite codes faster than the rate-limited join.

### 9.7 Say truthfully what the app stores and who sees it

Write the data statement from the code and the hosting, and change both together.

**Check:** For each privacy sentence, point to the code or request that makes it true.

**WhistMate lesson:** Two of the About page's six statements are easy to omit: questions to the rules assistant go to an AI model, and the hosting logs page views and may set a 30-day referral cookie.

## 10. Accountability

### 10.1 Name the maker, and keep a public About page true

Put the developer's name and a support address in the app and the README, on a page that opens signed out and says how to have data deleted.

**Check:** Signed out, find who made the app within a minute, then write to the address.

**WhistMate lesson:** Before the listing work the README was the platform's template and the app had no contact screen. Asked "How do I delete my account?", the rules assistant answered only that this was not in the rulebook; the ruling points that refusal to the About page.

## 11. Testing

Independent review is a test too; section 13 covers it.

### 11.1 Keep core logic pure and test it without dependencies

Put domain rules in a module with no imports and no input or output.

**Check:** Run the logic tests where no packages are installed.

**WhistMate lesson:** Package installation was blocked on the developer's machine, so scoring got 36 tests under plain `node` before any build ran. The tests could not catch a wrong rule: rulebook and code agreed on a tie-break the owner knew to be wrong.

### 11.2 Guard every rule that exists in two places

When logic or text must exist twice, generate one copy from the other or add a check that fails when they differ.

**Check:** Change one copy; a check must fail.

**WhistMate lesson:** On this platform server functions cannot import frontend modules, so scoring is copied into them. One check compared the copies over all 784 input combinations.

### 11.3 Test access rules against the real server code, and prove the tests can fail

Load the real function files into a test with a fake in-memory backend and call each as every kind of caller: signed out, outsider, forged cache, forged admin. Then prove each test can fail by running it on the code from before the fix (a mutation proof).

**Check:** Run the new tests on a scratch copy of the previous commit and expect failures.

**WhistMate lesson:** The functions run only on the platform, so the test swaps the platform's client for a stand-in and runs the unmodified files. Its first version passed 89 checks on the fix and failed 14 on the old code, each a hole already listed. On 19 November 2026 it ran 504 checks over all 24 functions that write.

### 11.4 Build a sandbox with realistic seeded data

Build a local copy where anyone can sign in, nothing real is touched and one request resets it, seeded through the app's own functions.

**Check:** Start it, sign in as three roles, change something, reset.

**WhistMate lesson:** The sandbox runs the real frontend and all 31 server functions on an in-memory store with 164 seeded rounds. Building it exposed two bugs before any review. It also assumed the platform protected the `role` field, which was false (9.3).

### 11.5 Reproduce and measure before you fix

Re-run each report on clean data, find the cause, and record a number the fix can be compared with.

**Check:** For each fix, show the same measurement before and after.

**WhistMate lesson:** The verifier re-measured the reviewers' button positions and contrast ratios and got the same figures. One report, "three taps on Cancel did nothing", could not be repeated.

### 11.6 Write down what was not verified

End each task with what was checked and what was not.

**Check:** The last task entry names what is still unverified.

**WhistMate lesson:** Two August changes to server functions were closed without a recorded live test; the November deploy showed they had never reached the live app. The task list still flags that no signed-in outsider has been tried against the real backend.

## 12. Shipping

### 12.1 Know what each deploy path ships, and fix the order

List the parts (site, data rules, server functions) and what publishes each. Deploy so that a new part never meets an old one.

**Check:** After deploying, compare the server's function list with the repository.

**WhistMate lesson:** On Base44 in November 2026 the Git sync published the site and the data rules but never the functions, which need a CLI command (observed on the live app). The working order was functions, site, push: with the site first, screens call missing functions; with the rules first, the old site reads nothing. The sync was not dependable either: one day it applied the rules but had not published the site five minutes later; the next day it did not apply the rules at all.

### 12.2 Verify the live site, signed out, and list what the hosting adds

After every deploy, check which build is served and what a stranger can read. The published page is your source plus what the platform injects.

**Check:** Read the name of the served script file (the bundle), request each table signed out, and list the requests and cookies not in your source.

**WhistMate lesson:** After the access fix the live API returned 0 records for seven tables to a signed-out caller, and the bundle contained no "poker". On Base44 in November 2026 the hosting added page-view logging, usage analytics and a 30-day referral cookie (recorded in the project's constants), and its builder pushed its own commits to the repository.

### 12.3 Record every tooling workaround

Write each tool failure's symptom and workaround at the top of the task list.

**Check:** A fresh session can deploy from the repository's notes alone.

**WhistMate lesson:** The platform CLI run through `npx` hung whenever the package registry was unreachable, because "latest" is looked up first; the cached copy worked.

### 12.4 Keep the repository as the memory

Keep three files: constants; decisions with reasons and rejected options; the live task list with a "resume here" block.

**Check:** Give the repository to a fresh agent and ask what comes next.

**WhistMate lesson:** When a usage limit cut the fix round off mid-wave, the resume block held what was merged, what was live, which agent owned which files and what to run next.

## 13. Working with AI agents on a build like this

### 13.1 Use reviewers who cannot see the code or each other, each with a persona and tasks

Give each reviewer agent a private copy of the app, a browser, a described person to be and tasks to complete, and nothing else. Require evidence for every finding.

**Check:** The brief forbids reading the source, says who the reviewer is, and lists tasks with checkable results.

**WhistMate lesson:** Six reviewers (a newcomer with an invitation, a scorekeeper with one free hand, a returning player, a designer told to measure, a rules expert, a QA tester) each ran 150 to 340 browser commands in a private sandbox: 138 findings, no blockers, 39 major, 84 minor, 15 ideas. Both defects the team already knew were found independently, a sign that little was missed.

### 13.2 Add a verifier who reproduces

Before any fix, a separate agent re-runs every finding, merges duplicates and traces each to a file and line.

**Check:** Every item on the fix list has a reproduction and a cause.

**WhistMate lesson:** The 138 findings became 86 problems: 80 confirmed, three intended behaviour, three corrected. The verifier found eight more that no reviewer had reported.

### 13.3 Rule on every problem before anyone codes

The lead writes a decision per problem, its owner, what is left undone and what nobody may change.

**Check:** Pick any problem; find its ruling and its owner.

**WhistMate lesson:** 66 rulings covered the 86 problems, with a vocabulary, a "must not change" list (scoring results, existing links, users' data, the privacy text) and a "deliberately not done" list. Where a reviewer's suggested fix and a ruling differ, the ruling wins.

### 13.4 Build shared pieces first, split the files, and ask for proof

One agent builds and documents the shared components. The rest then work in separate copies (Git worktrees) on files nobody else touches, and report with output and screenshots.

**Check:** File lists do not overlap; reports contain output and screenshots.

**WhistMate lesson:** Wave 1 delivered the confirmation dialog, empty and error states and text-direction helpers under the heading "Use these; do not re-create them". Checking the merged result still turned up fixes. Wave 2, three agents with disjoint files, was unfinished at the time of writing.

### 13.5 Ask the owner only what is theirs to decide

Agree what agents decide alone, what is the owner's (identity, artwork, house rules), and what "done" means as evidence with a stopping rule.

**Check:** The plan has an authority statement, a "done when" list and a bound.

**WhistMate lesson:** The owner delegated navigation, wording and design, and was asked for the developer's name, the game's scoring interpretations and the store icon. The plan stops after three review rounds; whether it reaches zero open blockers and majors was not yet known.

## 14. A one-page checklist

**Structure and navigation**

- [ ] Each tab's label and icon predict its content.
- [ ] Each page has one labelled back control.
- [ ] A page's group comes from its address or data.

**Flows**

- [ ] An invitation survives sign-up; an empty account says what to do.
- [ ] The core task was run ten times, one-handed.
- [ ] Typed work survives reload and Back.
- [ ] Every commit point has an edit, discard or cancel.
- [ ] Disabled buttons say why; results show before Save.

**States**

- [ ] Form defaults wait for the data.
- [ ] Every empty state names the next step.
- [ ] Empty, failed, missing and offline have separate messages.
- [ ] Archived items offer no write controls.
- [ ] Errors and confirmations appear beside their control.

**Wording**

- [ ] One word per thing, in the user's vocabulary.
- [ ] Every number has one definition and a nearby explanation.
- [ ] Right-to-left names display correctly.
- [ ] Date-only values stay the same day.

**Visual design**

- [ ] Each colour has one written meaning.
- [ ] Text contrast measures 4.5:1 or better.
- [ ] Nothing informative is below the type floor.
- [ ] One component each for confirmation, empty state, error, avatar, badge.
- [ ] Store icon and first screen match.

**Phones first**

- [ ] Every control is at least 44×44 px, re-measured after fixes.
- [ ] The primary action is visible at 375×667; nothing scrolls sideways at 320 px.
- [ ] Safe areas, keyboard and hover were checked on a phone.

**Accessibility**

- [ ] Every icon-only control has an accessible name.
- [ ] State and focus are visible without colour.

**Data access and privacy**

- [ ] Signed out, every table returns nothing.
- [ ] Functions check the caller against the stored record.
- [ ] Platform guarantees were attacked on a throwaway app.
- [ ] No function trusts a user-writable cache.
- [ ] Every "all rows" operation pages to the end.
- [ ] No secrets in responses; no convenience endpoint is public.
- [ ] Each privacy sentence matches code or a request.

**Accountability**

- [ ] Maker, contact and data deletion are on a public About page.

**Testing**

- [ ] Core logic is pure; its tests need no packages.
- [ ] Every duplicated rule has a drift check.
- [ ] Access tests run the real functions and fail on the old code.
- [ ] A resettable sandbox with realistic data exists.
- [ ] Findings were reproduced and measured, before and after.
- [ ] The task list names what is unverified.

**Shipping**

- [ ] The deploy order is written down.
- [ ] After deploy: new bundle served, signed-out reads empty, hosting additions listed.
- [ ] Tooling workarounds are recorded.
- [ ] A fresh agent can resume from the repository.

**Working with AI agents**

- [ ] Reviewers see only the running app, each with a persona and tasks.
- [ ] A verifier reproduced every finding.
- [ ] Every problem has a ruling and an owner.
- [ ] Shared pieces first; disjoint files; proof with claims.
- [ ] The owner's decisions and the stopping rule are written.
