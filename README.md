# ProofSet

A Bluecore-style **proof set** inside the InsiderOne (IO) email editor.

Bluecore shows proofs of a campaign for several customers from its audience on the campaign summary page. IO only previews one user at a time ("Previewing As" in the Preview and Test Message modal). ProofSet fills the gap: it runs IO's own single-user preview for customers from the campaign audience, 8 at a time, and shows the results side by side in one grid.

ProofSet is a separate project from Proofly (email client rendering). The two may be combined later.

Current stable version: **1.0.0** (first public release).

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Chrome.
2. Open the install link: <https://raw.githubusercontent.com/adityanmol/ProofSet/main/ProofSet.user.js> and click **Install** in the Tampermonkey tab that opens.
3. Open any IO panel (`https://<panel>.inone.useinsider.com`).

Updates: the script declares `@updateURL`, so Tampermonkey picks up new versions pushed to `main` on its regular update check (or via Tampermonkey > Utilities > Check for userscript updates).

### Updates inside IO

When a newer version is published, the ProofSet button shows an **Update vX.Y.Z** badge. Click it, choose **Update** (Tampermonkey opens; confirm there), come back and choose **Refresh page**. The check asks GitHub (1 KB) at most once every 30 minutes, and again when you return to the IO tab; it never calls IO. To check right away, open ProofSet and click the version next to the ProofSet title.

To release: bump `@version` and `const VERSION` together in `ProofSet.user.js` (build.js checks they match), run `node build.js`, commit and push.

### Pre-prod build

Install link: <https://raw.githubusercontent.com/adityanmol/ProofSet/pre-prod/ProofSet.preprod.user.js>

- Installs **alongside** production: its own name ("ProofSet (pre-prod)"), its own namespace and its own update URL (the `pre-prod` branch), so it never replaces or downgrades the production install.
- The footer button has a dashed border and a **PRE** badge; the drawer shows "pre-prod" next to the version.
- Both builds share saved audiences and the session's picked customers.

### Branches and builds

`staging` (development) -> `pre-prod` (validation, pre-prod install link) -> `main` (production install link).

### Versions

Production and pre-prod are numbered separately, in `versions.json`:

- `prod` is the version in `ProofSet.user.js`, served from `main` (e.g. 1.0.0, 1.0.1, ...).
- `preprod` is written into `ProofSet.preprod.user.js` by `build.js`, served from `pre-prod` (e.g. 1.2.6, 1.2.7, ...).

Each line only goes up, so Tampermonkey auto-updates both installs.

- Every change for validation: `node build.js --bump-preprod`, commit on `staging`, merge to `pre-prod`.
- Releasing to everyone: `node build.js --bump-prod` (on the commit you release), commit, merge to `pre-prod` and `main`. Note in CHANGELOG which pre-prod build it equals.
- `node build.js --check` fails if the pre-prod file is out of date or the two version sources disagree.

`ProofSet.user.js` is the only file to edit. `ProofSet.preprod.user.js` is generated from it:

```
node build.js          # regenerate ProofSet.preprod.user.js
node build.js --check  # fails if it is out of date (run before committing)
```

If the repository is private, the raw link only works for people with access; install by pasting the script into a new Tampermonkey script instead.

## Use

1. Open an email campaign. Visit the **Recipients** step once: ProofSet quietly saves the campaign's selected static or dynamic segment in the background.
2. Go to the **Design** step and click **ProofSet** (next to "Preview and Test Message").
3. To preview a different segment, click **Change audience** (or **Select audience** when ProofSet doesn't know the campaign's audience) next to Refresh Proofs. A dropdown opens: type part of a segment's name (or its ID) and pick it, or paste the segment's link and press Enter. The link then shows the segment's name; **Reset audience** goes back. If the segment has no customers with an email address, ProofSet warns you and shows one test proof for test@useinsider.com. Accepted link shapes (`<panel>` and `<id>` are whatever your segment uses; anything after the id, such as `?currentTab=...` or `/contacts`, is ignored):
   - `https://<panel>.inone.useinsider.com/dynamic-segments/<id>`
   - `https://<panel>.inone.useinsider.com/static-segments/<id>`

   For example, `.../dynamic-segments/76?currentTab=users-segment` or `.../static-segments/2/contacts`.
4. Proofs start rendering straight away. **Load more proofs** under the grid adds the next 8. **Refresh Proofs** starts over with a different 8.

### What each card shows

- Masked email (e.g. `j***@gmail.com`, linked to the customer's IO profile) and the rendered size in KB
- Subject line as resolved for that customer
- **Design** tag: *Unique* when no other customer in the sample sees this exact email, or *Shared by N* when N customers see the same email (same visible text, images and link destinations). Per-customer tracking, such as link query params (`srccode`, `promotion`) and tracking pixels, is ignored. The summary line shows how many distinct designs the sample produced, and warns when every customer sees the same design.
- **Sort by design** control above the proofs: *Unique first* or *Similar together*, with the active one highlighted.
- Flags: Gmail clipping (over 102 KB), close to the clip limit, unrendered Liquid left in the output, render errors
- The rendered email, scaled to the card width. Click a card to open its proof popup: customer (linked to their IO profile), size and design tag in the header, Desktop / Mobile and "Open in new tab" icons, and a slider (buttons or Left / Right keys) through all proofs; the subject and preheader sit just above the email. The email shows at its built width (scrolls sideways only if wider than 700px); close with X, Esc or clicking outside.
- **View in browser** inside the full-size view opens that customer's proof in a new tab. IO's real view-in-browser page (`<%ins_view_in_browser%>`) only exists after an email is sent, so previews cannot link to it.

The header shows the average size as "Estimated Template Size", like Bluecore.

### Session behaviour

The customers picked for a campaign and segment (a shuffled sample, plus how many are shown) are kept in **sessionStorage** (Profile ID and masked email only). Reopening ProofSet in the same tab shows the same customers, rendered from the current (including unsaved) design. If none are stored and the audience is known, ProofSet gathers 8 customers and renders straight away. **Refresh Proofs** picks a different 8. Closing the tab clears them.

The campaign's audience (segment id and name only, no PII) is kept in **localStorage** per panel and campaign. A segment chosen via **Change audience** is stored separately and used instead; **Reset audience** (shown only when the campaign's own audience is known) removes it and brings back proofs for the real audience.

## How it works

ProofSet runs inside the panel page and calls the same internal requests the panel itself uses, with the logged-in user's session and the page's CSRF token (`meta[name="csrf-token"]`).

| Purpose | Request |
| --- | --- |
| Static segment list (name to id) | `GET /segmentation/saved-segments/static-segment?page=N` returns `data[{text, value}]` |
| Dynamic segment list (name to id) | `GET /segmentation/saved-segments/dynamic-segment?per_page=100&page=N` returns `data[{id, name}]` |
| Static segment users | `POST /contact/proxy/static-segment/{id}/records` body `{invalidateCache, advancedFilter:{}, searchFilter:[], id:"{id}"}` |
| Dynamic segment users | `POST /contact/proxy/dynamic-segment/records` body `{invalidateCache, searchFilter:[], id:{id}}` |
| Render one proof | `POST /newsletter/dynamic-content-preview/get-preview-content` |

Segment user requests are asynchronous: `meta.status` is `pending` until IO has built the list, so ProofSet polls until `done`. Each page returns up to 100 contacts with `email` and `insider_id`.

The render request body:

```json
{
  "couponListId": 0,
  "isLiquidSyntax": true,
  "user": { "identifierType": "insider_id", "identifierValue": "<profile id>" },
  "subject": "<base64>",
  "preHeader": "<base64>",
  "html": "<base64 template html>"
}
```

`identifierType` values: `insider_id` (Profile ID), `em` (Email), `pn` (Phone), `uuid`, `c_distinct_id`.

The response contains base64 `html` (fully rendered, Liquid resolved), `subject`, `preHeader`, `plainText`, `insiderId` and `thumbnail` (URL of a JPEG screenshot, which IO's own modal displays). ProofSet renders the HTML in a sandboxed iframe with no script execution, and falls back to the screenshot if the HTML is empty. Each render takes about 1.2 s; ProofSet runs 3 at a time.

The template, subject, preheader and Liquid flag come from the editor's Vuex getters (`EMAIL_LOCALIZATION_STORE/getTemplateHTML`, `getMailSubject`, `getMailPreHeaderText`, `getIsLiquidSyntax`), so unsaved edits are included.

## Known limitations

- **Internal endpoints:** none of the requests above are published APIs. IO can change them without notice.
- **Sample source:** customers are drawn from the first page of segment users (up to 100), not the whole segment.
- **Audience types:** saved static / dynamic segments, and Email Address attribute rules that list full addresses (each listed address gets a proof). Other attribute rules and "All contacts" have no list to draw from; pick a segment instead. Excluded segments are ignored.
- **Coupons:** `couponListId` is sent as 0, so coupon codes show as the placeholder.
- **Recent Users:** each render may add the customer to IO's "Recent Users" list in Previewing As.
- **Design labels:** visible per-person content (for example a first name in the copy) makes each proof a unique design, which is correct. Tracking that lives outside query strings (for example a code in a link path) is not ignored yet.
- **PII:** emails are masked in the UI. Panel users without PII access may receive masked data from IO; previews use the Profile ID, so they still work.

## Roadmap

- Phase 1 (current): proof sets from IO segments.
- Draw the sample from the whole segment (paging with the `next` cursor).
- Coupon list support.
- Phase 2: Bluecore vs IO comparison for the same customers, once a client's customer profiles and product catalog are synced to IO.
