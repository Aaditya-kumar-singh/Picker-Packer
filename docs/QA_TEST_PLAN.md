# Picker & Packer — Device and Integration Test Plan

**Source branch:** `feature/faiz13-smart-label-page-setup`  
**Baseline commit checked:** `f93cbc5`  
**App:** YBM Picker & Packer, Expo SDK 58, React Native, Android-first  
**Primary device:** Samsung SM-M135F (1080 × 2408, density 450); ADB connected; scrcpy 4.1 available  
**Backend:** Explicitly configured TEST backend only. Do not run state-changing test cases against production.  
**Test users:** Picker and Packer test accounts supplied privately in the conversation. **Never copy passwords, login tokens, full credentials, or OTPs into this file, screenshots or CI logs.**

## 1. Objective and rules

Validate every implemented feature in the app, from staff login to pick → pack → print label → rider handoff, using both reproducible automated checks and the real Samsung phone. Record evidence for each case, not just a general "looks fine" note.

- **P0:** Blocks core picking/packing, leaks another staff member's data, causes irreversible duplicate/incorrect scans, invalid printing, or unintended production writes. Fix before proceeding.
- **P1:** Core feature works incorrectly or has a serious usability/recovery defect.
- **P2:** Cosmetic, non-blocking usability, or secondary empty/error state.
- **PASS:** Reproducible steps and expected result verified with evidence.
- **FAIL:** Actual differs from expected. Open a bug with ID, device, branch/commit, exact steps, masked evidence and relevant sanitized logs.
- **BLOCKED:** Test data, backend permission, camera, printer, or other dependency is missing; never mark as pass.
- **N/A:** Capability intentionally not implemented or disabled in the inspected branch; specify why.
- **NOT RUN:** No live test was performed.

**Destructive/irreversible operations:** A successful scan increments backend quantity, completing a pick changes the order, assigning a Packer or Rider changes ownership/status, and changing a password affects an account. Use **disposable test orders** (not operational orders), record order IDs and initial state before each batch, and create fresh fixtures to rerun. Change test-account passwords only with an agreed recovery/restore process.

## 2. Existing evidence and limitations

At plan creation, LocalMCP verified a connected Samsung SM-M135F, `scrcpy 4.1`, Expo Go installed (`host.exp.exponent`), and Metro listening on port `8081`. The following **non-mutating automated checks were run**:

| Check | Result |
|---|---|
| `npm test` from `frontend` | **31 PASS, 1 SKIP, 0 FAIL** (32 total) |
| `npx tsc --noEmit` | **PASS** |
| `npx expo config --type public --json` | **PASS** |
| Device accessibility/UI, actual barcode scanning and print output | **NOT RUN** |
| Live backend login and end-to-end order lifecycle | **NOT RUN** |
| Full lint | **Not clean in earlier checks**; existing project-wide lint issues need separate remediation |
| Native signed APK installation/upgrade | **NOT RUN** |

**Important source findings:** `frontend/src/config/auth.ts` sets `FULFILLMENT_OTP_LOGIN_ENABLED = false`; OTP is **not enabled**. The actual project has no `typecheck` or `check:architecture` npm scripts: use `npx tsc --noEmit` and `npm test` instead. Android label printing creates a sized PDF before opening the system print dialog. **Loaded physical paper-roll detection is not implemented**; printer paper size must be chosen/matched manually. A device-level default paper-size control is implemented.

## 3. Test accounts, fixtures and data isolation

The two supplied accounts have distinct PICKER and PACKER roles. Confirm they belong to the **same test warehouse** before end-to-end handoff. Don't store passwords in plaintext files, source code, test scripts, issue bodies or ADB commands included in permanent reports. Enter secrets interactively on the phone.

Prepare/identify the following **real test-backend fixtures** before running mutation batches:

| Fixture | Required initial state | Purpose |
|---|---|---|
| T-P01 | PICKING, assigned to test Picker; two SKUs, one qty = 1 and one qty >= 2; valid physical barcode(s); valid warehouse | Full pick → pack flow |
| T-P02 | PICKING, same Picker, partially picked | Resume/in-progress quantities |
| T-P03 | PICKING, same Picker, wrong/other SKU barcode available | Invalid barcode, over-scan, soft-failure |
| T-P04 | PICKING, different picker/warehouse (read-only negative fixture) | Ownership and warehouse authorization |
| T-P05 | PICKING, all lines fully picked, packer available in same warehouse | Assign Packer |
| T-K01 | PACKING, assigned to test Packer; multiple item quantities | Full packing/scanner test |
| T-K02 | PACKED and assigned to test Packer, with working server-generated barcode | Label/print/reprint/rider selection |
| T-K03 | PACKED, backend barcode error or unavailable image fixture | Printing error recovery |
| T-K04 | Different packer/warehouse (read-only negative fixture) | Role/ownership/warehouse authorization |
| T-R01 | Available Rider in the **same warehouse** | Valid dispatch |
| T-R02 | Rider assigned to another warehouse or unavailable | Rejection / filtering |
| T-H01 | Picker and Packer history with multiple pages, scans, dates and statuses | History filter/search/pagination |
| T-E01 | No assigned orders; profile with optional photo missing | Empty and fallback states |

Before mutations, record test backend's **order ID, warehouse ID, status, per-item ordered/picked/packed quantities, and assigned staff**. Back-end admin or a documented fixture-reset operation must supply any missing fixtures. Do not invent actual order IDs, SKUs, printer media, or scan results.

**One-phone role sequence:** Test Picker first → logout → sign in as Packer → confirm assignment → print/attach → assign Rider. Capture the status between roles. Do not keep both sessions on the same Android Expo Go instance.

## 4. Batch run order and exit gates

| Batch | Scope | Priority | Dependency / exit gate |
|---|---|---|---|
| B00 | Environment, safe test backend, baseline | P0 | Device, build, API configuration and test fixtures verified |
| B01 | Login, session and role isolation | P0 | Both accounts authenticate and their role routes are correct |
| B02 | Picker dashboard, orders, navigation | P1 | Lists, counts, search/filter/sort and navigation pass |
| B03 | Picker scan, quantities, camera | P0 | Wrong scans never mutate; valid scans increment exactly once |
| B04 | Pick completion and Packer handoff | P0 | Correct packer and warehouse receive order in PACKING |
| B05 | Packer dashboard and packing | P0 | Item quantities correct; PACKED transition occurs once |
| B06 | Label page setup, defaults and printing | P0/P1 | Preview/PDF/physical barcode verified, or hardware cases BLOCKED |
| B07 | Rider assignment and dispatch | P0 | Valid RIDER_ASSIGNED state and invalid requests blocked |
| B08 | Picker/Packer history | P1 | Status, scans, search and pagination accurate |
| B09 | Notifications | P1 | Correct role/order navigation, unread state and refresh |
| B10 | Profile, duty status, password, logout | P0/P1 | Updates, privacy and session clear verified |
| B11 | Offline, recovery, responsive layout, accessibility, security | P0/P1 | No data loss, incorrect retry, or cross-role information exposure |
| B12 | Regression, APK, release acceptance | P0 | Entire critical path repeats on signed APK, not only Expo Go |

**Batch rule:** Never mark a batch complete while any P0 case fails or while a required live/backend/hardware step is untested. Screenshots alone cannot prove server persistence or barcode readability.

## 5. Detailed test cases

### B00 — Environment and setup

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B00-01 | P0 | `git status --short --branch`, record SHA | Correct feature branch and no unexpected edits |
| B00-02 | P0 | `adb devices -l` | Exactly intended Samsung phone shown as `device` |
| B00-03 | P1 | `scrcpy --version`; open a mirror; inspect touch response | Device visible and responsive without accidental actions |
| B00-04 | P0 | Verify installed Expo Go SDK compatibility and `localhost:8081` reachability | App opens correct running project, no old bundle |
| B00-05 | P0 | Confirm `EXPO_PUBLIC_API_ENV=test` and HTTPS base URL without printing secrets | Only the isolated TEST backend is used |
| B00-06 | P0 | Confirm both provided accounts' role/warehouse and fixture IDs read-only | Picker and Packer permitted for the same test handoff |
| B00-07 | P1 | Save sanitized device model, Android version, screen resolution and density | Reproducible QA environment |
| B00-08 | P0 | Run Node tests, TypeScript, Expo configuration | Results collected; failures recorded, not ignored |

### B01 — Password login, session and role controls

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B01-01 | P0 | Cold-open while logged out | Login appears; protected routes aren't accessible |
| B01-02 | P0 | Sign in as test Picker using privately supplied credentials | Picker dashboard, role = PICKER and correct warehouse |
| B01-03 | P0 | Sign out, sign in as test Packer | Packer dashboard, role = PACKER; no Picker data |
| B01-04 | P1 | Empty phone/password | Required-field feedback, no network login |
| B01-05 | P1 | Incorrect password / invalid identifier | Clear error; no session created |
| B01-06 | P1 | Leading/trailing spaces around identifier | Identifier normalized; password is not altered |
| B01-07 | P1 | Show/hide password; keyboard return/submit | No accidental display, duplicate requests or hidden controls |
| B01-08 | P1 | Remember Me ON; relaunch app | Expected session resumes securely |
| B01-09 | P1 | Remember Me OFF; relaunch app | Verify documented expected behavior; flag if state still persists |
| B01-10 | P0 | Deep-link directly to other role's route | Redirect to authorized route or reject access |
| B01-11 | P0 | API returns 401/expired token in controlled test | Session clears and returns to login; no stale private data |
| B01-12 | P1 | Toggle network off during login; restore network | Recoverable error; retry succeeds only once |
| B01-13 | P0 | Check OTP option | Not visible/disabled in this branch (`FULFILLMENT_OTP_LOGIN_ENABLED=false`) |
| B01-14 | P0 | Switch between both accounts, check cached data | Previous account's orders, details and notifications never appear |

### B02 — Picker dashboard, assigned orders and routes

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B02-01 | P1 | Picker Home opens | Warehouse banner and KPI counts show real backend data |
| B02-02 | P1 | Tap Assigned Orders KPI | Correct Picker queue and count |
| B02-03 | P1 | Tap In Progress KPI | Only partially started picking orders |
| B02-04 | P1 | Tap History KPI | Picker history tab |
| B02-05 | P1 | Tap warehouse banner | Profile/warehouse details open correctly |
| B02-06 | P1 | Pull to refresh dashboard | Latest backend totals without duplicate cards |
| B02-07 | P1 | Search Orders by order number and order ID | Matching orders only, case/whitespace handling correct |
| B02-08 | P1 | Search by SKU/product/location/zone | Matches corresponding assigned order items |
| B02-09 | P1 | Cycle sort Date → Items → Order # | Stable, predictable order for each mode |
| B02-10 | P1 | Clear search, leave and return to Orders | Search resets as implemented; no stale results |
| B02-11 | P1 | No assigned orders / no search matches | Correct empty explanation and refresh/clear action |
| B02-12 | P1 | Open order, back, and reopen | Correct order ID and latest quantities |
| B02-13 | P0 | Attempt unassigned order ID via direct route | Ownership/queue check rejects it |
| B02-14 | P1 | API error, retry and slow response | Loading/error states are useful; no silent empty success |

### B03 — Picker item scanning and quantities

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B03-01 | P0 | Open T-P01 | Correct SKU, variation, bin/zone and ordered/picked counts |
| B03-02 | P0 | Manually enter valid EAN/SKU; submit | Backend picked quantity increments **exactly one** |
| B03-03 | P0 | Scan qty>=2 item twice | Increments one per scan; line done only at ordered quantity |
| B03-04 | P0 | Scan wrong SKU for this order | Error/soft-failure visible; no quantity change |
| B03-05 | P0 | Scan already complete SKU | No over-pick or double increment |
| B03-06 | P0 | Rapid double submit or repeated camera frames | Only accepted scan events increment quantity; no unintended duplicates |
| B03-07 | P1 | Blank input or whitespace | Validation; no API request |
| B03-08 | P1 | Open camera, grant permission | Scanner preview and close control usable |
| B03-09 | P1 | Deny camera permission, retry/return | Helpful permission state; manual entry remains usable |
| B03-10 | P1 | Continuous scan mode and camera close/reopen | No stuck camera, repeated stale frame, or freezes |
| B03-11 | P1 | Tap specific item vs Scan Next Item | Correct line/context selected |
| B03-12 | P1 | Toggle location sorting and inspect Zones sheet | Correct zone order and item counts |
| B03-13 | P1 | Scan offline or timeout | Error shown; do not falsely mark item picked |
| B03-14 | P0 | Reconnect after uncertain scan result | Refresh server quantity before retry; prevent silent duplicate |
| B03-15 | P1 | Back out mid-order and reopen T-P02 | Partial counts restored from backend |
| B03-16 | P1 | Wrong barcode alert → dismiss → rescan | Input refocus and successful recovery |
| B03-17 | P0 | Attempt scan for order assigned to another picker | Server denies; never changes other order |
| B03-18 | P0 | Scan final needed physical unit | Complete state becomes eligible for Packer assignment, not prematurely |

### B04 — Picking completion and Packer assignment

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B04-01 | P0 | Try Assign Packer before all items picked | Blocked with clear incomplete-pick reason |
| B04-02 | P0 | Finish all lines of T-P05 | Complete screen and eligible packers appear |
| B04-03 | P0 | Verify available packers | Same-warehouse candidates only |
| B04-04 | P0 | Select valid Packer and assign once | Server status moves PICKING → PACKING |
| B04-05 | P0 | Double tap Assign | Exactly one assignment, no duplicates |
| B04-06 | P1 | Empty packer list | Clear unavailable state, no false success |
| B04-07 | P0 | Missing/invalid warehouse identity | Fail closed; cannot assign arbitrary packer |
| B04-08 | P0 | Try out-of-warehouse packer with controlled backend test | Server rejects; assignment remains unchanged |
| B04-09 | P1 | Return to Picker Orders after assignment | Assigned order no longer falsely appears as active picking |
| B04-10 | P0 | Sign in as the assigned Packer | Order is visible as PACKING in Packer queue |
| B04-11 | P1 | Backend rejects already reassigned order | Correct error, no local success or wrong navigation |

### B05 — Packer dashboard, packing queue and item scans

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B05-01 | P0 | Packer login / Home | Only Packer-specific dashboard and Orders |
| B05-02 | P1 | Assigned, packed and history KPI cards | Counts and navigation match backend |
| B05-03 | P1 | Search orders by ID/SKU/item | Correct results and clear behavior |
| B05-04 | P1 | Sort by Order #, Date, Items | Correct stable sorting |
| B05-05 | P1 | Packed filter and All Orders | Correct PACKED-only vs overall list |
| B05-06 | P1 | Pull refresh; empty/error/retry state | Current data and recoverable errors |
| B05-07 | P0 | Open T-K01 | Correct SKU, item count, ordered and packed quantities |
| B05-08 | P0 | Scan valid code manually | Packed quantity increments by one |
| B05-09 | P0 | Scan wrong item / overpacked item | No quantity mutation, wrong barcode feedback |
| B05-10 | P0 | Rapid scan/repeated camera frame | No duplicate backend increments |
| B05-11 | P1 | Camera permissions/close/reopen and focus | Continuous scanning remains usable |
| B05-12 | P1 | Copy SKU/barcode chip | Expected value copied; no unrelated order data |
| B05-13 | P1 | Choose a different item line | Selected item and remaining counts are correct |
| B05-14 | P1 | Order info sheet | Correct read-only details and close behavior |
| B05-15 | P0 | Final required scan | Status becomes PACKED once; label modal appears |
| B05-16 | P0 | Reopen PACKED order | Label/rider handoff still available; scan cannot overpack |
| B05-17 | P0 | Open unassigned/different warehouse packer order | Ownership denied |
| B05-18 | P1 | Offline scan followed by reconnect | No falsely completed package; server remains source of truth |

### B06 — Paper setup, barcode labels, printer selection and default

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B06-01 | P0 | Open PACKED order label | Logo, server barcode and order number appear (correct order) |
| B06-02 | P0 | Compare preview with generated PDF | Same physical positions/dimensions; no cropping |
| B06-03 | P1 | Choose 50×25, 50×30, 75×50, 100×150 | Correct preview/PDF `@page` size per preset |
| B06-04 | P1 | Choose A6, A5, A4, Letter | No clipping; text and barcode correctly fit |
| B06-05 | P1 | Enter custom fractional mm size | Exact supported dimensions persist during edit |
| B06-06 | P1 | Switch portrait/landscape | Width/height swap; layout recalculated |
| B06-07 | P1 | Independently change top/bottom/left/right margins | Content moves within printable bounds |
| B06-08 | P1 | Set gutter and change its side | Content shifts to correct physical side |
| B06-09 | P1 | Change horizontal and vertical alignment | Logo/barcode/order group repositions without overlap |
| B06-10 | P0 | Enable auto barcode fit | Square QR and wide barcode maintain source aspect ratio |
| B06-11 | P1 | Disable auto-fit, change manual barcode dimensions | Target respected within available space |
| B06-12 | P0 | Make margins too large | Print disabled with meaningful error |
| B06-13 | P1 | Create very small but still permitted code | Scan-ability warning appears |
| B06-14 | P0 | Save current paper as default | UI shows checked; reopen app/label → saved size is selected |
| B06-15 | P0 | Uncheck default | Saved preference removed; current label unchanged |
| B06-16 | P0 | Reopen after unchecking | Built-in 50×25 mm selected, not previously saved size |
| B06-17 | P1 | Change to another size without checking default | Print with temporary size; reopen → old default/built-in |
| B06-18 | P1 | Set another custom/landscape default | Exactly one default replaced; dimensions persist |
| B06-19 | P1 | Switch Picker/Packer sessions on same device and return | Stored device default behavior consistent; no leaked credentials |
| B06-20 | P0 | Open Android system print dialog | Sized PDF handed to compatible printer service; matching media selectable |
| B06-21 | P0 | Print sample on real 50×25 label roll | No clipped edges; correct order; physical scanner reads it |
| B06-22 | P0 | Print sample on alternative roll/printer | Select actual media manually; no driver scaling mistakes |
| B06-23 | P1 | Disconnect printer or cancel print dialog | App never claims paper physically printed; recoverable |
| B06-24 | P1 | Test Wi-Fi/Bluetooth thermal printer with required print service | Printer appears if supported; if not, record blocked/model/driver |
| B06-25 | P1 | Saved iOS AirPrint printer (only when iOS device available) | Selection persisted, PDF printed; otherwise N/A |
| B06-26 | P0 | Server fails to generate packing barcode | Clear error, retry; do not print blank/invalid code |
| B06-27 | P0 | Print successfully, then choose Label attached | Rider assignment becomes accessible only after explicit confirmation |
| B06-28 | P1 | Switch printer models | Loaded roll **is not auto-detected**; UI does not misleadingly claim detection |

### B07 — Rider selection / dispatch

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B07-01 | P0 | Try Rider assignment before PACKED | Blocked by current state / server |
| B07-02 | P0 | PACKED order, label not attached | Required label confirmation enforced in UI |
| B07-03 | P0 | Confirm label attached after print | Rider modal opens |
| B07-04 | P0 | List available riders | Only eligible same-warehouse riders are offered |
| B07-05 | P1 | No riders available | Useful empty state; no arbitrary dispatch |
| B07-06 | P0 | Choose valid rider once | Server status PACKED → RIDER_ASSIGNED |
| B07-07 | P0 | Double tap rider | Only one assignment |
| B07-08 | P0 | Try rider from wrong warehouse | Rejected; order still valid and assignable |
| B07-09 | P0 | Backend reports QR/package requirement | Label modal opens with reason; can retry correctly |
| B07-10 | P1 | Return to Packer queue | Dispatched order disappears from active queue |
| B07-11 | P0 | Verify change via history/backend | RIDER_ASSIGNED record and rider ID match intended order |
| B07-12 | P2 | Rider-side barcode verification (separate Rider app/backend test) | Run only if accessible; not a Picker & Packer UI feature |

### B08 — History and completed orders

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B08-01 | P1 | Picker History | Own scans grouped by order, newest first |
| B08-02 | P1 | Search by order number, SKU, item, barcode | Correct match and clear controls |
| B08-03 | P1 | Expand/collapse order group | Correct detail rows, quantity and timestamps |
| B08-04 | P1 | Picker previous/next history page | No duplicated/missing rows; disabled at boundaries |
| B08-05 | P1 | Packer History All | Own processed orders and scan records |
| B08-06 | P1 | Packer PACKED filter | No RIDER_ASSIGNED entries |
| B08-07 | P1 | Packer RIDER_ASSIGNED filter | Only dispatched entries |
| B08-08 | P1 | Pull refresh after processing new order | Count and entries update |
| B08-09 | P1 | Multiple-page history / large dataset | No missing records, hang or reordered scans |
| B08-10 | P1 | Empty history, API failure/retry | Correct empty and error states |
| B08-11 | P0 | Switch between roles | Picker/Packer never see unauthorized history |

### B09 — Notification center

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B09-01 | P1 | Open notification icon | Correct modal, readable count and close |
| B09-02 | P1 | New assigned Picker order / progress | Role-relevant item only |
| B09-03 | P1 | Packer gets new PACKING/PACKED work | Correct order/status notification |
| B09-04 | P1 | Tap notification | Correct order/role destination |
| B09-05 | P1 | Mark one notification read | Unread counter decreases |
| B09-06 | P1 | Mark all as read | Counter reaches zero |
| B09-07 | P1 | Refresh notification list | No duplicates for unchanged backend state |
| B09-08 | P1 | Empty list | Helpful empty state |
| B09-09 | P0 | Logout then login as other role | Old role's notifications do not appear |
| B09-10 | P1 | Offline notification refresh | Error/recovery, no fabricated new activity |

### B10 — Profile, duty status, password and sign out

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B10-01 | P1 | Open profile from tab/warehouse banner | Correct staff identity, role and warehouse |
| B10-02 | P1 | Missing/failed photo | Placeholder shown without crash |
| B10-03 | P1 | Open Edit Profile, cancel, reopen | Unsaved edits discarded |
| B10-04 | P1 | Change name/email/other permitted fields in test profile | Backend persists allowed values, displays updated fields |
| B10-05 | P1 | Invalid phone/email / field-level backend error | Form shows validation without losing useful input |
| B10-06 | P1 | Toggle Go Off Duty → Go On Duty | Status matches backend; no duplicate requests |
| B10-07 | P1 | Duty-status API fails | Error shown, no false status change |
| B10-08 | P1 | Password dialog: empty/mismatch/short new password | Client/backend validation works |
| B10-09 | P0 | Wrong current password | Reject; existing credentials still valid |
| B10-10 | P0 | Valid password change **only with approved restore procedure** | New credential works; old credential fails |
| B10-11 | P0 | Logout | Secure token cleared, restricted screens inaccessible |
| B10-12 | P0 | Switch roles after logout | No cached personal profile or staff data leakage |

### B11 — Resilience, accessibility, privacy, performance

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B11-01 | P0 | Disable internet on order page / scanner | No false successful scan or assignment |
| B11-02 | P0 | Restore internet after timeout | Retry/refresh reconciles server state without double increment |
| B11-03 | P0 | Inject 401/403 via isolated mock/test backend | Login/authorization failure handled; no fallback identity |
| B11-04 | P1 | Inject 400 scan soft-failure success-envelope format | Informative error; scan count remains unchanged |
| B11-05 | P1 | Inject 429/500, empty or malformed API response | No crash, safe retry and valid error handling |
| B11-06 | P0 | Wrong/absent `EXPO_PUBLIC_API_BASE_URL` in isolated bundle | Fail closed; never silently use production or a random host |
| B11-07 | P1 | Background/resume, force-stop/reopen during scan | Quantities reloaded and no accidental duplicate |
| B11-08 | P1 | Open/close scanner, label modal, profile editor repeatedly | No stuck camera, keyboard, overlay or memory growth |
| B11-09 | P1 | Test 1080×2408 Samsung UI with keyboard open | Inputs, bottom actions and scroll reachable |
| B11-10 | P1 | Change Android font-size/display-size settings | No clipped critical controls, usable buttons |
| B11-11 | P1 | Check TalkBack/accessibility hierarchy and touch targets | Buttons have purpose labels and operable tap targets |
| B11-12 | P0 | Review sanitized ADB logs / network error messages | No plaintext passwords, tokens, OTP or other staff private data |
| B11-13 | P1 | Measure repeated list loading, long scroll and history | Reasonably responsive; capture actual timings |
| B11-14 | P1 | Reopen app after saved printer default, logout/relogin | Saved label preference persists; auth remains isolated |

### B12 — Final regression and signed APK acceptance

| ID | Priority | Test action | Expected |
|---|---|---|---|
| B12-01 | P0 | Repeat `npm test` and `npx tsc --noEmit` | No failures/regressions |
| B12-02 | P1 | Run `npx expo lint` on a disposable worktree or without accepting auto-configuration | Record pre-existing vs new lint errors; no unrelated file changes |
| B12-03 | P0 | Confirm changed files against target branch | No unrelated source/dependency changes |
| B12-04 | P1 | Clear Metro cache and reload device using current branch | App loads current JS without redbox |
| B12-05 | P0 | GitHub CI and test APK pipeline (if triggered) | CI green, signed APK and checksum published/verified |
| B12-06 | P0 | Install signed APK on Samsung, cold-start | Native app launches, no Expo-only dependency |
| B12-07 | P0 | Login both roles using real signed APK | Correct role dashboard and stable session |
| B12-08 | P0 | Smoke-test pick → pack → label → rider on fresh test order | Persisted end-to-end handoff |
| B12-09 | P0 | Print and scan physical label from signed APK | Physical barcode passes scanner verification |
| B12-10 | P0 | Upgrade existing signed install using same signing key | No package-signature error or unintended loss of saved settings |
| B12-11 | P1 | Uninstall/reinstall behavior | Expected app-local settings/session reset, no stale labels |
| B12-12 | P0 | Final test report | P0 all pass; no unacknowledged P1; blocked hardware tests clearly marked |

## 6. Executable command checklist

Use PowerShell in the connected project directory. **Commands below are preparation/examples, not a claim that each has run.**

```powershell
# Repo
git status --short --branch
git rev-parse --short HEAD

# Hardware
adb devices -l
adb shell wm size
adb shell wm density
scrcpy --version

# From the frontend directory (actual scripts available in package.json)
cd frontend
npm test
npx tsc --noEmit
npx expo config --type public --json | Out-Null

# Start Expo (separate terminal; stop a stale Metro first)
npm start

# Connect a Samsung phone to Metro only when dev server is active
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" -p host.exp.exponent

# Inspect UI and gather evidence WITHOUT recording credentials
adb shell uiautomator dump /sdcard/window.xml
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png
adb logcat -d
```

**Capture restrictions:** Enter passwords privately; avoid `adb shell input text <password>` because commands may be logged. Crop/mask screenshots, never commit raw `logcat`, JWTs, customer phones, order details or staff identity into Git. Use ADB taps with *current* positions from each screenshot, not hard-coded coordinates from another screen. Use backend admin/read-only endpoints to verify state, without exposing tokens.

**Physical printing:** Open the app's Android print service and select matching media; vendor Bluetooth/Wi-Fi printing may require a printer-specific plugin. The app currently cannot detect the loaded roll. Verify at least two physical sizes when hardware is available; otherwise mark hardware cases BLOCKED.

## 7. Execution / evidence record

For **every test case**, record the following in a private run log:

```text
Run ID: QA-YYYYMMDD-01
Branch / SHA:
Build: Expo Go dev / signed APK and APK checksum
Device / Android version:
Backend environment: TEST
Role: PICKER / PACKER (never include password)
Case ID:
Precondition & fixture ID (mask identifying details):
Steps executed:
Expected:
Actual:
Status: PASS / FAIL / BLOCKED / N/A / NOT RUN
Evidence reference: sanitized screenshot/video, log snippet, backend before/after
Defect ID / severity / owner:
Retest status:
```

Recommended report format:

| Batch | Total | Pass | Fail | Blocked | N/A | Not run | Evidence / defects |
|---|---:|---:|---:|---:|---:|---:|---|
| B00 | 8 | | | | | | |
| B01 | 14 | | | | | | |
| B02 | 14 | | | | | | |
| B03 | 18 | | | | | | |
| B04 | 11 | | | | | | |
| B05 | 18 | | | | | | |
| B06 | 28 | | | | | | |
| B07 | 12 | | | | | | |
| B08 | 11 | | | | | | |
| B09 | 10 | | | | | | |
| B10 | 12 | | | | | | |
| B11 | 14 | | | | | | |
| B12 | 12 | | | | | | |

**Stop/go gates:** B00+B01 before mutation; B02+B03+B04 before Packer handoff; B05+B06 before Rider assignment; then B07–B11; B12 release acceptance last. Do not mark a batch done based solely on automated tests, and do not release with an unresolved P0.

## 8. Scope and intentional exclusions

The plan tests **implemented** features visible in `src/screens`, the Expo Router routes, `src/api`, and the print utilities. It does not assert that an admin can create/reset test orders from this mobile app; fixtures must be prepared by authorized backend administration. The Rider verification API is separate and is not part of the Picker & Packer UI. OTP is disabled in this code version. Auto-detection of a printer's physically loaded roll is unsupported without compatible native/vendor reporting. No secrets are stored here.

**Source references:** `frontend/src/screens/*`, `frontend/src/app/*`, `frontend/src/api/*`, `frontend/src/utils/packagePrinterSettings.ts`, `frontend/src/utils/packageLabel.ts`, `frontend/src/utils/printPackageLabel.ts`, `frontend/src/config/auth.ts`, `picker-app-api.md`, `packer-app-api.md`.
