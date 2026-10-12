import "@/ro-print.css";

import logo from "@/assets/athene-logo.png";
import { company, money, plainNumber } from "@/lib/athene-master";
import { documentRoNumber, weekdayLabel, type ReleaseOrder } from "@/lib/ro-document";

const wholeMoney = (value: number) => Math.round(Number(value || 0)).toLocaleString("en-IN");

export function ReleaseOrderSheet({ order }: { order: ReleaseOrder }) {
  const { scheduleMonth, days, totals } = order;
  const radio = order.media === "radio";
  const stationEsc = (order.station ?? "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stationLine = (
    radio && order.station && !order.channelName.toLowerCase().includes(order.station.trim().toLowerCase())
      ? `${order.channelName} / ${order.station}`
      : order.channelName
  ).replace(stationEsc ? new RegExp(`\\s*[-–—]\\s*(${stationEsc})\\s*$`, "i") : /$^/, " / $1");

  return (
    <article className="ro-sheet">
      <div className="ro-watermark">ATHENE</div>

      <header className="ro-top">
        <img src={logo} alt="Athene Advertising" className="ro-logo" />
        <span className="ro-page">Page 1 of 1</span>
      </header>

      <div className="ro-title">
        <h1>{radio ? "RADIO RELEASE ORDER" : "TV RELEASE ORDER"}</h1>
        <h2>
          CHANNEL : {stationLine}
        </h2>
      </div>

      <div className="ro-parties">
        <div>
          <span className="ro-label">FROM</span>
          <strong>{company.companyName.toUpperCase()}</strong>
          <p>{company.address}</p>
          <p>{company.city}</p>
          <p>
            <span className="ro-state-label">STATE &amp; CODE</span> : {company.state},{" "}
            {company.stateCode}
          </p>
          <p>
            <span className="ro-state-label">PLACE OF SUPPLY</span> : {company.placeOfSupply}
          </p>
          <p>
            <span className="ro-state-label">PAN NO</span> : {company.pan}
          </p>
          <p>
            <span className="ro-state-label">CIN NO</span> : {company.cin}
          </p>
          <p>
            <span className="ro-state-label">GSTIN</span> : {company.gstin}
          </p>
          <p>
            <span className="ro-state-label">HSN/SAC</span> :{" "}
            {radio ? company.hsnSac.replace(/^TV(\s*\/\s*RA)?\s+RELEASE/i, "TV / RA RELEASE") : company.hsnSac}
          </p>
        </div>
        <div>
          <span className="ro-label">TO</span>
          <strong>{order.channel.legalCompanyName}</strong>
          {order.channel.address.split(/\r?\n/).filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
          <p>{order.channel.city}</p>
          <p>
            <span className="ro-state-label">STATE &amp; CODE</span> : {order.channel.state},{" "}
            {order.channel.stateCode}
          </p>
          <p>
            <span className="ro-state-label">PAN NO</span> : {order.channel.pan || "—"}
          </p>
          <p>
            <span className="ro-state-label">GSTIN</span> : {order.channel.gstin || "—"}
          </p>
        </div>
      </div>

      <div className="ro-client">
        <div className="ro-client-line">
          <span>CLIENT NAME :</span>
          <strong>{order.client || "—"}</strong>
          <em>RO NUMBER :</em>
          <b>{documentRoNumber(order)}</b>
        </div>
        <div className="ro-client-line">
          <span>BRAND :</span>
          <strong>{order.brand || "—"}</strong>
          <em>RO DATE :</em>
          <b>{order.roDate}</b>
        </div>
        <div className="ro-client-line">
          <span>CAMPAIGN :</span>
          <strong>{order.campaign || "—"}</strong>
        </div>
      </div>

      <p className="ro-salutation">
        Dear Sir,
        <br />
        {radio
          ? "Kindly broadcast the advertisement listed below on behalf of our client specified above:"
          : "Kindly telecast the advertisement listed below on behalf of our client specified above:"}
      </p>

      <table className="ro-schedule">
        <thead>
          <tr>
            <th colSpan={9} className="ro-schedule-title">
              Schedule for the month of {new Date(scheduleMonth.year, scheduleMonth.month, 1).toLocaleString("en-GB", { month: "short", year: "numeric" })}
            </th>
            {days.map((day) => (
              <th key={day} className="ro-day">
                <small>{weekdayLabel(scheduleMonth.year, scheduleMonth.month, day)}</small>
                <b>{day}</b>
              </th>
            ))}
          </tr>
          <tr>
            <th className="ro-col-program">{radio ? "Station / Language" : "Program"}</th>
            <th>Start</th>
            <th>End</th>
            <th className="ro-col-caption">{radio ? "Timeband" : "Caption"}</th>
            <th className="ro-center">
              Nett
              <br />
              Rate
            </th>
            <th>ACD</th>
            <th>Spots</th>
            <th>FCT</th>
            <th className="ro-col-cost">Nett Cost</th>
            {days.map((day) => (
              <th key={day} className="ro-day-blank" />
            ))}
          </tr>
        </thead>
        <tbody>
          {order.rows.map((row) => (
            <tr key={row.id}>
              <td className="ro-center">
                {radio
                  ? [row.station || order.station, row.language || order.language]
                      .filter(Boolean)
                      .join(" / ")
                  : row.program}
              </td>
              <td className="ro-center">{row.startTime}</td>
              <td className="ro-center">{row.endTime}</td>
              <td className="ro-center">{radio ? row.timeband : row.caption}</td>
              <td className="ro-center">{Number(row.nettRate || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
              <td className="ro-center">{plainNumber(row.acd)}</td>
              <td className="ro-center">{plainNumber(row.spots)}</td>
              <td className="ro-center">{plainNumber(row.fct)}</td>
              <td className="ro-right">{wholeMoney(row.nettCost)}</td>
              {days.map((day) => (
                <td key={day} className="ro-center">
                  {row.daily[day] ? plainNumber(row.daily[day] as number) : ""}
                </td>
              ))}
            </tr>
          ))}
          <tr className="ro-total-row">
            <td colSpan={5}></td>
            <td className="ro-center">{plainNumber(totals.acd)}</td>
            <td className="ro-center">{plainNumber(totals.spots)}</td>
            <td className="ro-center">{plainNumber(totals.fct)}</td>
            <td className="ro-right">{wholeMoney(totals.nettCost)}</td>
            {days.map((day) => (
              <td key={day} className="ro-center">
                {totals.daily[day] ? plainNumber(totals.daily[day] as number) : ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div className="ro-lower">
        <div className="ro-lower-left">
          <div className="ro-amount-line">
            <span>TOTAL CHARGEABLE</span>
            <strong>{money(order.taxableValue)}</strong>
          </div>
          <div className="ro-amount-line">
            <span>TAXABLE VALUE</span>
            <strong>{money(order.taxableValue)}</strong>
          </div>
          <table className="ro-tax">
            <thead>
              <tr>
                <th>Tax</th>
                <th>Rate</th>
                <th>Taxable Value</th>
                <th>Tax Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.taxes.map((tax) => (
                <tr key={tax.label}>
                  <td>{tax.label}</td>
                  <td className="ro-center">{tax.rate}%</td>
                  <td className="ro-right">{money(tax.taxableValue)}</td>
                  <td className="ro-right">{money(tax.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ro-payable-row">
            <span>TOTAL AMOUNT PAYABLE</span><i>:</i><strong>{money(order.totalPayable)}</strong>
          </div>
          <div className="ro-payable-row">
            <span>TOTAL AMOUNT IN WORDS</span><i>:</i><strong>{order.amountWords}</strong>
          </div>
          <h3 className="ro-remarks-title">REMARKS</h3>
          <p className="ro-remarks">{order.remarks}</p>
        </div>
      </div>

      {(order.media === "tv" || order.media === "radio") && (
        <p className="ro-note ro-special-instruction">
          <span className="ro-note-label">Note : </span>
          <span className="ro-note-text">
            {(order.specialInstructions?.trim() ||
              "This is a computer generated Release Order and does not require any signature and seal."
            ).replace(/^note\s*:\s*/i, "")}
          </span>
        </p>
      )}

      <footer className="ro-footer">
        <strong>{company.footerName}</strong>
        <span>|</span> {company.footerAddress} <span>|</span> {company.phone} <span>|</span>{" "}
        {company.email} <span>|</span> {company.website}
      </footer>
    </article>
  );
}

function Meta({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="ro-meta-row">
      <dt>{label}</dt>
      <dd>
        <i>:</i>
        {strong ? <strong>{value}</strong> : value}
      </dd>
    </div>
  );
}
