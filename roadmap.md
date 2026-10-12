# Roadmap
- [x] Show editable Terms & conditions in manual/saved RO forms and place invoice/proforma terms after Charges and tax.
- [x] Month-wise view nests FY folders (FY 2025-26 → April 2025…March 2026) on release orders, invoices and proformas; separate FY-wise view removed.
- [x] Freeze the Medium (code) column in the Tax & numbering settings table — sticky cell paints labels while the table scrolls horizontally; cleaned up three conflicting CSS blocks.
- [x] Add whole-column selection and alignment/text-size controls to document tables.

- [x] Fix edit forms so saved channel names resolve to Channel Masters through aliases.
- [x] Fix bulk-action counters showing 1 selected when no checkbox is selected.

- [x] Simplify Manual RO media choices to labels only: TV, RADIO, EVENT, PRINT, DIGITAL.
- [x] Properly align the curved media choice boxes.
- [x] Replace the top-left header logo with the uploaded Athene logo (and favicon)
- [x] Keep each RO schedule TOTAL row and special note on page one; move only chargeable values, taxes, remarks, payable amount, and generated-document note to page two.
- [x] Drop the "TOTAL" label from the red schedule totals bar (numbers stay); drop "Note :" from the page-two generated sentence; single "Note :" prefix on page one with the note flowing to two lines and "alternative spot positioning." on its own second line (company default updated).
- [x] Restyle RO totals, weekends, and spot counts for clearer reading.
- [x] Default empty RO captions to the campaign name.
- [x] Match RO schedule colors to the supplied reference and center the page-two summary block.
- [x] Match branded and unbranded invoice PDFs to the supplied TV, radio, digital, and print Excel formats, including first-page e-invoice placement.
- [x] Improve printed invoice readability, tighten schedule column widths, and match the payable rows to the supplied alignment reference.
- [x] Extend the invoice payable rows across the page to remove the empty left gap.
- [x] Match the uploaded TV proforma reference and fit the complete PDF on one portrait A4 page.
- [x] Improve proforma print readability and restore its branded header and footer while retaining one-page A4 output.
- [x] Add editable RO, invoice, and proforma format settings, snapshotting each format for future documents only.
- [x] Expand format settings with header, footer, watermark and page-number positioning, plus per-format and all-format undo, redo, and reset actions.
- [x] Upgrade proforma lines with digital buy type, print details, text rows, custom columns, and editable draggable headings and rows.
- [x] Make all Simple Invoice table headings editable and preserve them in saved invoices and PDFs.
- [x] Source service charge from Client Master, remove the company default, warn on plan mismatch, and keep print tax at 5% media / 18% service.
- [x] Add RO-only Draft Mail UI with per-RO recipients, PDF attachment, optional files/text, and editable company mail-template settings; leave Gmail as a deployment placeholder.
- [x] Allow Event as an invoice media type so invoices can be created for events.
- [x] RO numbers as "TV / 2026-27 / 001" with media code and automatic financial year.
- [x] Simplified mail draft setting: single editable mail text with automatic detail tokens.
- [x] Give Event invoices dedicated Date of the Event, Client/event details, Particulars, and Net Cost columns.
- [x] Split mixed-media proformas into one draft per medium.
- [x] Show short "RO 001" numbers in lists and file names, full number in the editor and PDF.
- [x] Keep other dates when editing a single day in the invoice spot calendar.
- [x] Move invoice tax, payable, bank and terms blocks to a new page when the summary is long.
- [x] Align the invoice IRN/Ack block and place the e-invoice QR directly above the PAN details.
- [x] Keep every invoice date and its spot count together when DATE (SPOTS) text wraps.
- [x] Keep all consecutive rows for the same invoice channel together on one page when they fit.
- [x] Vertically center invoice schedule tables on continuation pages.
- [x] Enlarge invoice table, bank-details, and terms text without changing company, client, or invoice-detail sizing.
- [x] Prevent automatic invoice-table overflow pages from bypassing continuation-page vertical centering.

- [x] Release Orders: make asc/desc sort control match the proforma & invoice sort button style.
- [x] Simple RO: no event name column anywhere, including the restore/deleted-column list.
- [x] Widen RO schedule day boxes so weekday names fit on one line (PDF and on-screen sheet).
- [x] Ask delete confirmation only for confirmed release orders; unconfirmed ones delete immediately.
- [x] Add flexible editable tables to new and saved Print, Event, and OTT ROs; use Publication, Edition, Language, Position, Height, Width, Size, No of Ins, calendar Date of Ins, and Media Cost for Print.
- [x] Treat dated Print plan columns as insertion dates and place Date of Ins immediately before Media Cost.
- [x] Fix automatic Print detection when the first schedule row contains numbers that resemble calendar days.
- [x] Detect Print, Digital/OTT, and Event schedule sheets automatically during plan upload.
- [x] Split populated Print dates into separate rows while merging their shared Media Cost into one cell.
- [x] Add clear spacing between release-order boxes in the numbering and document steps.
- [x] Restore the financial-year media prefix in Manual RO numbering.
- [x] Vertically center every invoice and release-order schedule between protected header and footer boundaries.

- [x] Add Ctrl/Cmd multi-cell vertical merging to Print, Event, and Digital/OTT invoices and PDFs.
- [x] Show invoice column restore only after a default column is deleted; Print invoices inherit Language, No of Ins, and Date of Ins only when those columns exist in the source RO.
- [x] Fit dense TV and Radio RO schedules within A4 with single-line table text and no header/footer overlap.
- [x] Auto-size TV and Radio RO columns and rows to their content without unnecessary empty space.
- [x] Keep TV and Radio RO text large and readable by splitting wide monthly schedules across pages.

- [x] Carry the brand estate code from a plan into the proforma (shown and deducted)
- [x] Carry the brand estate code from a release order into invoices created from it
- [x] Print plans: keep Circulation, read full Date of Insertion, and place "With TOI" package publications on the same release order.

- [x] Import each populated OTT match date as its own row, including CSK vs LSG.
- [x] Remove the summary section from Print, OTT/Digital, and Event invoices.
- [x] Remove the duplicate Rate column from Print invoices and always show fitted Edition, Page Position, H, W, Size, and No. of Ins columns.
- [x] Show Print package wording such as "With CHE" instead of zero in Net Cost, with H, W, and Size before No. of Ins.
- [x] Size column shows whole numbers (no decimals) in RO + invoice + PDF
- [x] Invoice EDIT view: Net rate last column; H, W, Size between Page Position and No. of Ins

- [x] Per-box text size (+ / −) with undo & redo on every RO, invoice and proforma editor
- [x] Add one blank line between STATE & CODE and CLIENT NAME in the RO PDF header.
- [x] Show Nett Rate between Caption and ACD in every TV and Radio RO (editor and PDF), even with saved drag orders.
- [x] Reduce TV/Radio RO schedule row text one step, plus the activity-month column
- [x] Vertically centre all TV/Radio RO schedule cell text
- [x] TV/Radio RO: centre Caption, right-align Net Cost, remove Net Cost decimals, and use regular body text one size smaller
- [x] RO Client, Brand, and Campaign labels and values use the same black colour
- [x] Enlarge RO terms by three size steps and place left-aligned rupees-in-words before the payable amount
- [x] Use a smaller “Schedule for the month of Sep 2026” heading and align equal-size payable amount rows
- [x] Align both RO payable labels to the same left edge as Terms & Conditions
- [x] Vertically centre the TV/Radio RO content block from title through table
- [x] Reduce RO terms body text by one size only
- [x] RO header: RO NUMBER on CLIENT NAME line, RO DATE on BRAND line; channel PAN/GSTIN under TO block; Athene PAN/CIN/GSTIN/HSN under FROM block
- [x] Increase footer text one size
- [x] Centre the schedule-title cell vertically
- [x] RO totals: equal gap above and below the left tax table (payable line vs taxable value)
- [x] Show the special-instruction note in red only on TV and Radio release orders
- [x] Print RO: centre Edition, show Media Cost and its total without decimals, remove the total-row label, and right-align the total amount
- [x] Print RO: keep Language independent from Campaign and clear legacy campaign-name values from the Language column
- [x] Print RO editor: show a vendor-agency selector for orders routed through another agency
- [x] Show the latest saved RO number beside the plan wizard's RO starting-number label
- [x] Evenly align all Proforma total labels and amounts, including wrapped brand-estate rows
- [x] Align the Proforma text-size control with the Charges and tax field grid
- [x] Show Print page position on the next Proforma line; show OTT match buy types as separate rows with merged media cost

- [x] OOH media type: plan import (OOH sheets), OOH RO / invoice / proforma, OOH columns (Medium, Location, Site Type, Size, Spots, Start Date, End Date, Number of Days, Total Cost), HSN 998363/998361, no brand estate code.
- [x] OOH plan with vertically merged media cost cells keeps the same merge in RO and invoice
- [x] Invoice/proforma Medium column uses each row's own publication/medium, not the RO channel name
- [x] All RO PDFs: remove TOTAL label from the totals row, no decimals, right-align the media-cost total
- [x] Proforma PDF: Medium column fits its content; freed space goes to Platform and Nett Cost

- [x] RO Masters section under Masters: confirmed ROs as master-data table + Excel download (columns fixed to uploaded master workbook)
- [x] Remove notification bell from top bar

- [x] RO master: include cancelled ROs, shown in red font in table and downloaded Excel
- [x] Invoice PDF: remove big gap between details block and table; center whole content top-to-bottom like RO (all media types)
- [x] Bulk bar: keep "Create invoice" as full labeled button (not icon-only)
- [x] Auto-fit Print, OTT, OOH and Event RO/invoice columns; centre all cells except Program, Channel and Net Cost

- [x] Expand Company Settings document formats into RO, Invoice and Proforma media-specific editors with heading, GST, table, cell, text, alignment and color controls

- [x] Add horizontal alignment controls to every RO edit/manual RO table, applying changes to all Ctrl/Cmd-selected cells

- [x] Add a download-PDF action to the invoice list rows
- [x] Show total RO value, GST, and total including GST on Plan Ready and Numbering and dates
- [x] Show Sub Total, Service Charge, GST 18%, and Total in wizard totals; add a separate GST 5% line for Print media (Print service charge remains taxed at 18%)
- [x] Fix the Plan Wizard service charge showing zero when a valid client or uploaded-plan percentage exists
- [x] Inspect the uploaded All News Channels workbook and import its 4.12% service-charge summary for TV plans
- [x] Add Company Settings → Backup & Restore with full JSON download, upload preview, duplicate-safe merge, and one confirmation before saving.
- [x] Remove Y axis from dashboard Month-wise activity chart

- [x] Recycle bin: type "Empty list" to confirm Empty list; per-row checkboxes + Delete selected

- [x] Radio invoice: "Program" heading only (no Timeband), text centred
- [x] Tally-style Company backup/restore: Company selector at top, 3 restore choices (merge new only / restore as separate company / wipe-and-restore with 3-step confirmation + rename old company), bell reminder at month end
- [x] Ctrl+Z undo and Ctrl+Y redo across every edit screen in the app
- [x] Message centre bell (top right): team channel + one-to-one chats, backup reminder inside
- [x] Remove "Create a company" option; tidy message panel and dialog field alignment
- [x] Read the exact service-charge percentage from the uploaded plan's Service Charge row
- [x] Company settings-only backup file: download settings alone, and restoring such a file restores only company settings.
- [x] Client courier address box with copy button.
- [x] Add sign-in-only staff access with email/password, protected production desk, and sign out.

- [x] Login page: logo top-left, red top border, blue bottom border, transparent logo centred as watermark
- [x] Recheck the live production login connection and authentication account status.

- [ ] Import: ask how to handle duplicate channels/clients (keep old / merge / create new)
- [ ] Bulk download PDFs for selected release orders, invoices and proformas
- [x] Greeting follows time of day; display name from account metadata (display_name/full_name/name)
- [x] Print agency RO: clearly show service-charge GST at 18%, split into CGST/SGST or IGST like invoices
- [x] Add Incentive invoices with Description of Services, Period of activity, Taxable Value, and no service charge
- [x] Print plan: split brand-estate publications into one coded RO and uncoded publications into separate RO(s); keep all together when the code is general
- [x] Unique styled + / × buttons on multi-value master fields

- [x] Restore the invoice alignment tool and make it clearly available in invoice editing.
- [x] Detect Digital invoice buying method from the plan and create CPM-buy or spot-buy rows accordingly.
- [x] Match the uploaded alignment reference across all RO, invoice, and proforma formats.
- [x] Remove the unwanted skipped-row warning shown in the latest screenshot and present brand-estate detection as a reminder, not an error.
- [x] For Digital/OTT Spot Buy, use each value under a match date as that date's spot count in RO and invoice.
- [x] Properly align the section shown in the latest uploaded screenshot.
- [x] Backup download clears the weekly backup reminder
- [x] Masters tables scroll with the page like RO/proforma/invoice lists
- [x] RO and proforma list tables fit the page width like invoices
- [x] Lighter scrolling (removed heavy blur animation, row paint containment)
- [x] RO PDF label "GSTN" → "GSTIN"; spelling fixes (advertisement, In case)
- [x] Remove logo from dashboard top-left and sign-in page
- [ ] Images not loading — waiting on user to say which images/pages
- [x] Final screen-size and error pass: verified sign-in layout and all main sections at mobile/tablet/desktop sizes; no page-level horizontal overflow or broken images among rendered assets. Data-backed image locations still need a specific failing example; preview backend returned 403 for company_books.
- [x] Redesign side menu (same content, better look)
- [x] Sign-out button label: 'Log out' not username
- [x] Side menu: distribute items evenly top-to-bottom in the sidebar
- [x] Manual RO medium picker: more unique card design
- [x] View tabs order: Month-wise, Number-wise, Client-wise (RO, proforma, invoice)
- [x] RO/proforma/invoice tables: no text wrapping in cells
- [x] Channel list: independent inner scroll
- [x] Plan import: match channel/legal name via DB channel aliases
- [x] Align selected-item count inline with bottom-right actions for RO, proforma, and invoice
- [x] Invoice save error (row-level security) explained and verified fixed: tested saving a real invoice with your account — it saved fine; test row cleaned up. Cause was the missing staff permission, already corrected earlier; if it reappears, sign in again / refresh.
- [x] Standardize and visually verify alignment for every confirmation popup.
- [x] Remove the grey backdrop from every confirmation popup and visually verify it.
- [x] Simplify every RO, proforma, and invoice document label to SERVICE CHARGE only.
- [x] Eliminate save/PDF permission errors for invoices, proformas, and release orders; verify all three while signed in.
- [x] Use uploaded-plan service charge throughout RO, plan-created proforma, and RO-created invoice; remove client-master mismatch warning.
- [x] Show combined GST @ 18% / GST @ 5% rows on proformas and Indian comma formatting for Net Rate everywhere.
- [x] Vertically center Print, OTT/Digital, and Event document content from top to bottom.
- [x] Channel matching uses every alias in Channel Masters and ignores HD/SD/4K suffixes (SUNTV, KTV, KTV HD → same master).
- [ ] Channel nett rate changed by a plan: add new active rate row, mark old one inactive with the change date (awaiting user confirmation of details).
- [x] Center RO first-page content; right-align only RO/invoice amount columns and totals; label vendor GSTIN as GSTIN NO.
- [x] Add a half-line gap between RO address lines and STATE & CODE, matching the legal-name-to-address spacing.
- [x] Keep print service charge on invoices; exclude it from direct/estate ROs and show RO controls only for agency orders.


- [x] Center the NET RATE table heading.
- [x] Invoice editor: select Proforma No from saved proformas, keep typed Reference No separate, and print only Proforma No.
- [x] Show a message-centre bell alert for greeting messages too.
- [x] Redesign the dashboard Month-wise activity chart to feel more unique and professional.
- [x] Restyle the message centre professionally and keep the daily greeting separate from alert counts.
- [x] Align the Company Settings tax table with contained horizontal scrolling and a tidy reset action.
- [x] Align collapsed format-section heading rows cleanly (legend border cut)

- [x] Show only header and footer in the artwork live preview.
- [x] Split document-format live preview into separate Main Page and GST Page sheets.

- [x] Show one document preview at a time with Main Page and GST Page switches.

- [x] Center the document preview and make the GST page show full tax, identity, summary, bank, and terms details.
- [x] Add dedicated editing options for the GST preview page.
- [x] Rebuild the Company Settings live preview so it matches the real PDF exactly for RO, proforma and invoice — channel details, full table, GST summary, amount in words, bank details, terms.
- [x] Ask for confirmation before saving Document formats settings; after confirming, clear undo/redo history and make "Last saved" restore the just-saved settings.
- [x] Saved document format settings apply only to ROs/invoices/proformas created after saving; older documents keep their format.
- [x] Replace the browser save prompt with a centered in-app confirmation for Company Settings.

- [x] Fix Simple RO format and preview so it uses Date / Particulars / Amount instead of TV.
- [x] Add a separate portrait Incentive Invoice format and live preview.
- [x] Make Invoice and Proforma live previews redraw correctly after every format change; keep RO behaviour unchanged.
- [x] Make Incentive Invoice use the Proforma-style layout shown in the reference while remaining portrait.
- [x] Show only “TAX INVOICE” as the title on Simple and Incentive invoices.
- [x] Make Invoice format changes appear immediately in live preview.
- [x] Show only each RO, Invoice, and Proforma format’s actual table headings in alignment controls.
- [x] Ensure every Invoice format edit redraws and visibly applies in its live preview.
- [x] Keep Proforma and Incentive subtotal, service-charge, tax, and payable rows independent from detail-cell alignment.
- [x] Remove the Spots total from OTT and Digital invoice tables while retaining the net-cost total.
- [x] Keep Release Order terms and conditions visible by moving an overflowing terms block onto a clean branded page.

- [x] Keep Net Rate and Total as the final two columns in every Release Order and invoice table.
- [x] Show Station only on Radio ROs; show only Channel Name on every other RO.
- [x] Treat plain Total columns as total amounts for OTT, Radio, and Event plans without inventing a Nett Rate.
- [x] Keep Activity Date before Nett Rate and Total in imported OTT/Digital RO and invoice tables.
- [x] Resolve plan text like “JIOHOTSTAR - AUS vs IND” through channel aliases and show only the Channel Master name in non-Radio RO headings.
- [x] Make Release Order PDF previews fill the viewer width and prevent the loading message from appearing below stale thumbnail pages.
- [x] Replace every remaining browser alert and confirmation with an in-website Athene dialog.
- [x] Keep Release Order terms on the existing GST/summary page and compact them when space is tight; never create a third terms page.
- [x] Show PDF previews one large page at a time with numbered controls for every generated page.
- [x] Print invoices inherit No of Ins, Date of Ins, and Language only when those columns are present in the source RO.
- [x] Keep Release Order terms at their original text size and reclaim unused space above them instead of shrinking.
- [x] Match the final Release Order summary/terms page to the supplied layout while leaving header and footer artwork unchanged.
- [x] Match terms & conditions font and placement exactly to the uploaded reference RO PDF.
- [ ] Move the wizard step rail to a horizontal 1-2-3-4 stepper at the top; fill the freed space and enlarge the document preview.
- [ ] Speed up how fast document previews open.

## Open
- [x] Correct numbering-step media badges: Print PR, Digital/OTT Digital, Event Ev, OOH ohh; preserve TV and RADIO.
- [x] Keep each Channel Master vendor address field on its own line in release orders, including saved documents.
- [x] Sort invoice and proforma number columns numerically without activity-month precedence.
- [x] Keep a selected plan party checked for document creation and clear old party choices on a new upload.
- [x] TV and Radio invoice tables: allow Date (Spots) three lines while keeping Producer and Channel within two lines at the existing font size.
- [x] Make detail rows in every release-order, invoice, and proforma document table match the tallest detail row.
- [x] Release Orders: replace Mail status with a colored Bill Received status, short filter, and row toggle.
- [ ] RO PDF: remove the "Taxable value" line from the GST summary block (user request 3 Oct 2026)
- [x] Radio: match station masters ("Suryan FM / Coimbatore") before the all-over channel master.
- [x] Center RO and invoice overflow-page content between the visible header and footer; show the generated-document disclaimer once on the final page.
- [x] Group print Release Order tax rows as Print Media CGST/SGST, then Service Charge CGST/SGST.
- [x] Clicking a selected column again deselects it (toggle) in RO, manual RO, invoice, and proforma editors; column-select button restyled as a tinted circle that fills with a checkmark when selected.
- [x] Match the invoice table Channel dropdown to the Party dropdown instead of browser autocomplete suggestions.
- [x] Keep column-select arrows on their own line aligned with their table headings, including Channel.
- [x] TV and Radio invoice PDFs: keep every channel name on one line by widening Channel with Date (Spots) as the first width donor.

- [x] Show Indian comma grouping in Digital release order and invoice Spots and IMP columns.

- [x] Speed up dashboard year/month filter
- [x] Short client names in channel rate table
