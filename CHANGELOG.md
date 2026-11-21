# Changelog

## 1.0.0 (stable)

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
