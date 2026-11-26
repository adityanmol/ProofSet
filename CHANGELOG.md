# Changelog

## Production 1.0.0 (first public release, = pre-prod 1.2.6)

First release for everyone. It contains everything validated in pre-prod up to build 1.2.6 (listed below under "Pre-release history"):

- Proofs for a sample of the campaign audience, 8 at a time with "Load more proofs"; static and dynamic segments, plus Email Address rules that list addresses.
- Searchable segment picker under "Change audience", with Reset audience.
- Design grouping (Unique / Shared by N) with Unique first / Similar together sorting.
- Proof popup: slider, fixed height, Desktop / Mobile, open in new tab, profile links, tooltips.
- Drag & drop editor emails with product recommendation blocks, Liquid and legacy templates.
- Invalid segment warning with a test proof for test@useinsider.com.
- Tracking pixels neutralised in previews, "View in browser" fixed, page scroll locked while open.
- Update badge with "Refresh to finish".

Production (main) starts its own numbering at 1.0.0 with this release; pre-prod keeps its own numbering (currently 1.2.6) and goes on from there. Production 1.0.0 = pre-prod 1.2.6. The pre-release notes are kept below for reference.

# Pre-release history

## 1.2.6 (pre-prod build)

- While ProofSet is open, the IO page behind it no longer scrolls (overflow hidden on the page); while a proof popup is open, the proof grid behind it no longer scrolls. Both are put back exactly as they were on close.
- The loader no longer shows a customer count before it knows one: "Gathering customers from "<segment>"…" (and "Rounding up some lucky subscribers…").
- Campaigns whose Recipients rule lists email addresses directly (Attributes: Email Address is / contains a@x.com, b@y.com) are now picked up as the campaign's audience. ProofSet previews each listed address (by email address, like IO's own picker), 8 at a time, and links the address to its IO profile when IO returns one. Partial values such as "@brand.com" are ignored. The addresses are kept only in this tab (sessionStorage); localStorage keeps just a count. A saved segment in the same rule still takes priority.

## 1.2.5

- The segment picker now opens as a dropdown right under "Change audience" in the header (search field + list; a pasted segment link still works with Enter), instead of a separate bar across the drawer. It closes on pick, Esc or a click outside.
- The link's label shows where you are: "Change audience" for the campaign's own audience, "Select audience" when no audience is known, and the chosen segment's name (up to 28 characters, full name on hover) after you pick one by hand. Reset audience puts it back to "Change audience" / "Select audience".
- The picker no longer opens by itself when a segment is invalid or the audience is unknown; the warning above the test proof points to it instead.

## 1.2.4

- Reset audience now shows whenever you picked a segment by hand, including for campaigns with no segment ProofSet can use (for example, attribute rules, or a campaign whose Recipients step was never opened). Resetting there removes the chosen segment and shows the test proof for test@useinsider.com with the "couldn't find this campaign's audience" note. When the campaign's own segment is known, Reset goes back to it as before.

## 1.2.3

- Fix: reopening ProofSet showed every proof loaded earlier in the tab (e.g. 24 after two Load mores). It now always opens with the first 8 (same customers, from cache) and Load more adds the next 8 on click.
- Slider tooltips read "Previous proof" / "Next proof" (the arrow keys still work).
- Change audience is now a searchable segment picker: type part of a segment name (or its ID) and pick it from the list, with Up / Down / Enter or the mouse. Static and dynamic segments are listed together with their type and ID; the current one is marked. The two segment lists are loaded once, when the field is first used, and kept for 10 minutes; searching happens in the browser. Pasting a /static-segments/ID or /dynamic-segments/ID link still works.

## 1.2.2

- Load more proofs now adds the new proofs below the ones already on screen. The grid no longer rebuilds or jumps to the top: existing proofs stay as they are, the new cards fade in, and the drawer scrolls gently to the first new one. The chosen sort (Unique first / Similar together) is kept.
- Fix: emails built in IO's drag & drop editor with product recommendation blocks ("You May Also Like") showed empty proofs. ProofSet now sends the same extra fields IO's own "Previewing As" sends (the recommendation feed URLs and the plain-text version), so those blocks are filled.
- Segment check: if the campaign's segment (or a pasted one) has no customers, or none of them has an email address, ProofSet shows a warning ("This seems to be an invalid segment... Please link or choose a valid segment"), opens the segment field, and shows a single proof for test@useinsider.com instead of a blank drawer. The same test proof shows when no audience is known yet. The test profile is not linked to any profile; hovering it shows "Test InsiderOne Profile".
- Customers without an email address are no longer picked for proofs.

## 1.2.1

- Fix: a tab that already had a sample saved by an older version kept showing those 10 customers with no "Load more proofs". Samples saved before 1.2.0 are now ignored, so ProofSet gathers a fresh 8 (one segment lookup) and the button appears.

## 1.2.0

- Proofs load 8 at a time. A "Load more proofs" button under the grid adds the next 8 from the same shuffled sample (no new segment call; proofs already shown come from cache, so only the new customers are rendered). It disappears once every loaded customer is shown. Refresh Proofs starts over with a fresh 8.
- Proof popup slider only goes through the proofs that are on screen in the grid, in the grid's order.
- Proof popup has a fixed height, so it no longer jumps in size while moving between proofs.
- Subject line, preheader and the slider sit in their own bar above the email and stay put while the email scrolls. The slider is on the right; a long subject wraps after 60% of the row.
- Popup is 800px wide with 10px of space between the bordered box and the email (740px for the email).
- Tooltips on every icon in the popup: Desktop view, Mobile view, Send test message (coming soon), Open in new tab, Previous / Next proof, Close.

## 1.1.0

- Slider in the proof popup: previous / next buttons with a "3 / 10" position, and the Left / Right arrow keys, through every rendered proof in the grid's current order (sorting included). Proofs change with a short, calm slide (out 160 ms, in 260 ms; none if the system asks for reduced motion). Desktop / Mobile stays as chosen while sliding.
- Icons from IO's own sprite: Desktop (line-desktop), Mobile (line-architect-app-push), Send test message (line-architect-test-journey; disabled, coming soon), Open in new tab (line-export), slider chevrons (line-chevron-left / right). Order: Desktop, Mobile, Send test message, Open in new tab.
- Customer emails link to their IO profile (/user-profiles/<Profile ID>, new tab) on the cards and in the popup title. The Profile ID already comes with the segment list, so this adds no calls to IO.
- Subject line and preheader moved out of the bordered email box, just above it.
- Popup header and body are white; only the email itself brings its own background.

## 1.0.9

- Fix: the Update badge did not appear after a new release. The last check's result ("latest is 1.0.6") was kept for 6 hours, even after Tampermonkey had already updated the script past it, so the newer 1.0.8 was never looked up. Now a saved result older than the installed version is ignored, results expire after 30 minutes (was 6 hours), and the check also runs when you come back to the IO tab. All checks call GitHub only (1 KB each), never IO.

## 1.0.8

- Proof popup: Desktop / Mobile switch and "Open in new tab" are icon buttons (with tooltips and screen-reader labels).
- White background behind the email; the email sits in a bordered box (drawn as an outline, so a 700px email still has no sideways scroll).
- Subject line and preheader moved into the top of that box, right above the email copy, instead of under the customer's email address. Long subjects wrap and never widen the popup.

## 1.0.7

- Fix: the Desktop switch in the proof popup stayed at mobile width. Responsive templates (e.g. width="700" with max-width:100%) shrink to 375px in Mobile, and switching back re-measured the email before it had grown again. Desktop now uses the width the template is built at (its widest declared table width, 700px for the Teleflora template; 600px if none), growing only if the content is genuinely wider.
- Proof popup: no shadow around the email frame.
- Cards: 5px inner padding.
- Header: version shown as a superscript on "ProofSet" (8px), with "by Proofly" right-aligned under the wordmark.
- Click the version superscript to check for an update immediately (ignores the 6-hour wait); if a newer version exists, the Update badge appears on the button.

## 1.0.6

- Update notice on the ProofSet button. When a newer version is published on this build's own branch (main for production, pre-prod for pre-prod), an orange "Update vX.Y.Z" badge appears on the button. Clicking it opens a small prompt with Later / Update; Update opens the Tampermonkey install page in a new tab and the badge turns into "Refresh to finish". On returning to the IO tab the prompt asks to refresh (with a reminder to save the design first). After the refresh, the button briefly shows "Updated to vX.Y.Z".
- The version check calls GitHub only (never IO), at most once every 6 hours, only when the ProofSet button is added on a Design page, and fetches just the first 1 KB of the script. If GitHub cannot be reached, nothing is shown.
- `VERSION` constant in the code drives the drawer label; `build.js` refuses to build if it differs from `@version`.

## 1.0.5

- Fix: the "Sort by design" control disappeared for some audiences (often a custom audience chosen via Change audience). It was shown only when the sample had more than one distinct design. It now shows whenever 2 or more proofs rendered, for any audience; when every customer sees the same design, the options are disabled and marked "all the same", with the reason on hover.

## 1.0.4

- Card hover: the card lifts 10px with a soft shadow (0.5s transition); the whole card is clickable with a pointer cursor.
- New proof popup, 740px wide with 20px padding (700px for the email). The email shows at the width it was built at (measured: 600px for most templates); the popup scrolls sideways only when that width is more than 700px. Long emails scroll inside the popup.
- Popup header: "Proof for <masked customer>", subject, preheader, size, design tag and any warnings, a Desktop / Mobile (375px) switch, and "Open in new tab" (this customer's proof, trackers removed). Close with the X, Esc or a click outside.

## 1.0.3

- Fix: pages kept loading forever. The email's tracking pixel (pxl.mon-trk.com, carrying the partner code) never answers preview traffic, so every proof card, the full-size view and the "View in browser" tab waited on it indefinitely. Tracking images (tracker hosts, 1x1 or hidden images) are now replaced with a blank 1x1 in everything ProofSet displays, so viewing a proof never fires a tracker or counts as an open. Size, design grouping and the Gmail check still use the untouched email.
- Lighter on IO:
  - Rendered proofs are cached for the page's lifetime; reopening ProofSet with the same customers and an unchanged design makes no new calls to IO.
  - Segment customers are reused for 10 minutes, so Refresh Proofs does not query IO's segment service again.
  - At most 2 preview renders in flight (was 3); segment polling capped at 8 checks, 2 s apart (was 15 at 1.5 s), and only after a user click.
  - The page watcher runs at most once a second, only on a campaign's Recipients or Design step, and makes a network call only when the Recipients segment rule changes.

## 1.0.2

- Fix: "View in browser" still opened IO's unfilled link on heavy emails. 1.0.1 rewrote the link after the preview iframe's `load` event, which waits for every remote image and tracking pixel, so on real emails it often had not run yet when the link was clicked. The link is now rewritten in the HTML before it is shown, independent of loading.
- Recognises the token raw, HTML-escaped and percent-encoded (`<%ins_view_in_browser%>`, `&lt;%...%&gt;`, `%3C%ins_view_in_browser%%3E`, `%3C%25...%25%3E`).
- All links in the full-size view open in a new tab.

## 1.0.1

- Fix: "View in browser" in the full-size proof view. IO's link uses the send-time token `<%ins_view_in_browser%>`, which IO fills (and creates the hosted page for) only when an email is actually sent; preview renders, including IO's own "Previewing As", leave it unfilled, so the link led nowhere. ProofSet now points it at that customer's own rendered proof, opened in a new tab with scripts blocked (CSP `script-src 'none'`) and a readable tab title. Other links are untouched; temporary links are released when the drawer closes.
- Pre-prod build: `ProofSet.preprod.user.js`, generated by `build.js`, with its own name, namespace and update URL (`pre-prod` branch) so it installs alongside production; PRE badge on its button and "pre-prod" in the drawer. Button, wrapper and stylesheet ids are now per build so both can run on the same panel.

## 1.0.0 (first internal stable build, superseded)

- First stable release. Same functionality as 0.6.3, marked stable.
- Added Tampermonkey @updateURL / @downloadURL / @homepageURL pointing at this repo's main branch, so installs update automatically.

## 0.6.3

- Design tag sits on the card's top border at the top-right, half outside and half inside.
- Header sizes: version 8px, "by" 12px, Proofly logo 16px tall.

## 0.6.2

- Design tag (Unique / Shared by N) moved to the top-right corner of each proof card, next to the size. Warnings (Gmail clipping, unrendered Liquid, errors) stay in a row above the Subject line and only show when present. Long emails truncate with an ellipsis.

## 0.6.1

- Official Proofly logo (tagline removed) shown after "by" under the ProofSet wordmark, embedded in the script.

## 0.6.0

- Reset audience: the campaign's own audience (from the Recipients step) and a segment chosen via "Change audience" are now stored separately. When a different segment is in use and the campaign's audience is known, a "Reset audience" link appears next to "Change audience" and brings back proofs for the real audience. Hidden for campaigns with no audience or one ProofSet could not read. Choosing the campaign's own segment via a link also counts as a reset. Old saved audiences migrate automatically.
- Design tag reads simply "Unique" or "Shared by N" (no Design A/B letters); hover for details. Design tag and card flags moved above the Subject line, so nothing sits on top of the email content.
- "by Proofly" now shows a Proofly logo slot. Set PROOFLY_LOGO_SRC to the official logo (URL or data: URI); until then a stand-in uses Proofly's CTA icon and brand colour.

## 0.5.0

- Theme follows the IO panel brand: primary #0a2ecc, subtle #dae1fb, text #2c3546 / #656f85, Figtree, 4px radius, regular-weight buttons. ProofSet CTA is an outlined primary button, 40px like IO's footer buttons.
- New logo area: "ProofSet" wordmark in primary blue, with a small uppercase version tag and "by Proofly" underneath.
- Audience section is now on demand. When the audience is known, only a "Change audience" link sits next to Refresh Proofs (hover shows the current segment) and the segment name appears in the summary line. The link field shows automatically only when no audience is found, or when "Change audience" is clicked (with Cancel).
- Spacing and mobile header fixes.

## 0.4.0

- Theme matches Proofly: brand #b54708, Figtree font, 4px radius, badge style. ProofSet CTA is an outlined brown button with a grid icon, same height as Proofly's.
- Drawer header shows "by Proofly" under ProofSet.
- Sort is now a small segmented control ("Sort by design: Unique first | Similar together") with the active option highlighted. Original order until one is picked; clicking the active option switches to the other.
- Opening ProofSet with a known audience renders proofs straight away (previously it stopped at a "No users picked" screen until Refresh Proofs was clicked). Refresh Proofs also re-reads an audience saved after the drawer opened.
- Audience capture on the Recipients step is silent (no toast).
- Footer CTA placement fixed: ProofSet sits in its own wrapper in the footer bar, in one row between Proofly and "Preview and Test Message", instead of stacking inside IO's button wrapper.

## 0.3.0

- Design grouping fixed: proofs are compared by what the customer sees (visible text, images, link destinations), ignoring per-customer tracking (link query params such as srccode / promotion, and tracking pixels). Previously every proof showed as unique because tracking codes always differ. Labels now read "Design A · shared by 2" / "Design D · unique".
- New sort CTA above the proofs: first click shows unique designs first, next click groups similar designs together (largest group first), and so on.
- Layout: audience/link section moved to the top, message below it. Size and design summary on a second, smaller line with the size in bold.
- Drawer width set to min(100vw, 96vw); responsive below 768px (wrapping audience row, single-column cards, smaller controls).
- Cards scale the email uniformly to the card width (no fixed 0.5 scale), so proofs fill the card at any width.
- Full-size modal: fits the screen, scrolls internally for long emails and shrinks to fit short ones; close with X, Esc or clicking outside. Fixed the email collapsing to a 150px strip (height was never applied) and the right edge being clipped by the scrollbar.
- Subject falls back to the variation's saved subject when the editor getter is empty.

## 0.2.1

- Customer-facing wording: "Here's a sample of what your customers in '<segment>' will receive." No mention of random selection in the UI.
- Loading step reads "Gathering 10 customers from '<segment>'…".

## 0.2.0

- Submitting a segment link (button or Enter) now picks customers and renders proofs straight away, instead of stopping at the Refresh Proofs screen.
- Loading screen with spinner, current step and rotating light-hearted messages; live "Rendering proofs: X of 10 ready" progress.
- Buttons and the link field are disabled while work is in progress.
- Replaced the "Identical to N other proof(s)" flag with Version labels (Version A, B, ...) and a summary of distinct versions, including a warning when every customer gets the same email.
- Clearer empty state when the campaign's audience is unknown.

## 0.1.0

- First draft: ProofSet button on the Design step, audience capture from the Recipients step or a pasted segment link, 10 customers stored in sessionStorage, proofs rendered via IO's preview request in sandboxed iframes, size and Liquid flags.
