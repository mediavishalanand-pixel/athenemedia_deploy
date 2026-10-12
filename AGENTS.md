Protected browser writes use `authenticatedWrite` to validate the current account and retry once after token refresh, preventing stale-session RLS failures without bypassing database security.
Staff sessions persist across browser restarts and rely on automatic token refresh; users sign out only with the manual Log out control.
Document party selectors accept only records from Client Masters and Channel Masters; invoices may bill either type while preserving the selected master snapshot.
Plan party choices include their plan rows in document creation and reset on each fresh upload, preventing stale or accidentally excluded selections.
Simple release orders retain a distinct format identity despite using Event row storage; Incentive invoices use their own portrait format.
Release Order tables pin money columns: TV/Radio ROs always show Nett Rate between Caption and ACD with Nett Cost last; TV/Radio invoices show Rate directly after Dur with Net rate last, while other RO and invoice tables keep Nett Rate and Total as their final two columns so saved drag orders cannot separate monetary values.
Print invoices inherit optional Language, No of Ins, and Date of Ins columns from the source Release Order instead of forcing or suppressing them.
PDF previews display one full page at a time with numbered controls derived from the actual page count, avoiding stacked-page scrolling.
Print agency Release Order tax summaries group both Print Media tax rows before both Service Charge tax rows for quick comparison.
TV and Radio invoice PDFs fit Producer and Channel to at most two lines and allow Date (Spots) up to three, borrowing unused width from automatic columns without changing font size or overall table width.
Release orders preserve Channel Master address fields as separate lines in their snapshots and PDF rendering, so vendor addresses remain in their entered order.
Document-table column selectors use the shared visible-data-cell selection helper and existing document snapshots for formatting, so merged/text rows remain safe and PDF output retains changes.
- RO Draft/Send mail POSTs prepared mails (To/CC/subject/body/base64 attachments) to an external gateway set in MAIL_GATEWAY_URL (+ optional MAIL_GATEWAY_TOKEN) via src/lib/mail-gateway.functions.ts — the mail provider is wired outside this app.
