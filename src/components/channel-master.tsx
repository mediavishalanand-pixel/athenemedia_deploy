import { MultiValueField } from "@/components/multi-value-field";
import { Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DeleteConfirmation } from "@/components/delete-confirmation";
import { MasterImport } from "@/components/master-import";
import { MasterExportButton } from "@/components/master-export-button";
import { stateForCode } from "@/lib/gst";

import {
  useChannelRates,
  useChannels,
  useClients,
  useDeleteChannel,
  useDeleteChannelRate,
  useSaveChannel,
  useSaveChannelRate,
  joinRateBand,
  splitRateBand,
  pruneRateHistory,
  useUpdateChannelRate,
  useToggleChannelActive,
  type Channel,
} from "@/lib/master-data";
import { useIsAdmin } from "@/lib/use-is-admin";

type Draft = {
  id?: string;
  channel_name: string;
  legal_company_name: string;
  address_line1: string;
  address_line2: string;
  address_line3: string;
  city: string;
  state: string;
  state_code: string;
  pin_code: string;
  place_of_supply: string;
  pan: string;
  gstin: string;
  ro_email: string;
  cc_email: string;
  contact_person: string;
  phone: string;
  default_nett_rate: string;
  aliases: string;
  notes: string;
  active: boolean;
};

const emptyDraft: Draft = {
  channel_name: "",
  legal_company_name: "",
  address_line1: "",
  address_line2: "",
  address_line3: "",
  city: "",
  state: "Tamilnadu",
  state_code: "33",
  pin_code: "",
  place_of_supply: "Tamilnadu,33",
  pan: "",
  gstin: "",
  ro_email: "",
  cc_email: "",
  contact_person: "",
  phone: "",
  default_nett_rate: "",
  aliases: "",
  notes: "",
  active: true,
};

function toDraft(channel: Channel): Draft {
  return {
    id: channel.id,
    channel_name: channel.channel_name,
    legal_company_name: channel.legal_company_name,
    address_line1: channel.address_line1,
    address_line2: channel.address_line2,
    address_line3: channel.address_line3,
    city: channel.city,
    state: channel.state,
    state_code: channel.state_code,
    pin_code: channel.pin_code,
    place_of_supply: channel.place_of_supply,
    pan: channel.pan,
    gstin: channel.gstin,
    ro_email: channel.ro_email,
    cc_email: channel.cc_email,
    contact_person: channel.contact_person,
    phone: channel.phone,
    default_nett_rate: channel.default_nett_rate == null ? "" : String(channel.default_nett_rate),
    aliases: (channel.aliases ?? []).join(", "),
    notes: channel.notes,
    active: channel.active,
  };
}

export function ChannelMaster() {
  const { data: channels = [], isLoading } = useChannels();
  const saveChannel = useSaveChannel();
  const deleteChannel = useDeleteChannel();
  const isAdmin = useIsAdmin();
  const toggleActive = useToggleChannelActive();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return channels;
    return channels.filter((channel) =>
      [channel.channel_name, channel.legal_company_name, channel.gstin, ...(channel.aliases ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(key),
    );
  }, [channels, search]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  /** Typing a GST state code fills the state name automatically; it stays editable. */
  const setStateCode = (value: string) => {
    const name = stateForCode(value);
    setDraft((prev) => (prev ? { ...prev, state_code: value, ...(name ? { state: name } : {}) } : prev));
  };

  const submit = () => {
    if (!draft) return;
    if (!draft.channel_name.trim()) return;
    saveChannel.mutate(
      {
        ...(draft.id ? { id: draft.id } : {}),
        channel_name: draft.channel_name.trim(),
        legal_company_name: draft.legal_company_name.trim(),
        address_line1: draft.address_line1,
        address_line2: draft.address_line2,
        address_line3: draft.address_line3,
        city: draft.city,
        state: draft.state,
        state_code: draft.state_code,
        pin_code: draft.pin_code,
        place_of_supply: draft.place_of_supply,
        pan: draft.pan.trim().toUpperCase(),
        gstin: draft.gstin.trim().toUpperCase(),
        ro_email: cleanEmails(draft.ro_email),
        cc_email: cleanEmails(draft.cc_email),
        contact_person: draft.contact_person,
        phone: draft.phone,
        default_nett_rate: draft.default_nett_rate === "" ? null : Number(draft.default_nett_rate),
        aliases: draft.aliases
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
        notes: draft.notes,
        active: draft.active,
      },
      { onSuccess: (saved) => setDraft(toDraft(saved as Channel)) },
    );
  };

  const remove = () => {
    if (!draft?.id) return;
    deleteChannel.mutate(draft.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        setDraft(null);
      },
    });
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <span className="eyebrow">Directory</span>
          <h1>Channel master</h1>
          <p>Legal details, billing contacts and rates for every channel you book.</p>
        </div>
        <div className="master-actions-left">
          <MasterExportButton kind="channels" />
          <button
            className="app-button secondary"
            onClick={() => {
              setDraft(null);
              setImporting(true);
            }}
          >
            <Upload size={17} /> Import Excel
          </button>
          <button
            className="app-button primary"
            onClick={() => {
              setImporting(false);
              setDraft({ ...emptyDraft });
            }}
          >
            <Plus size={17} /> Add channel
          </button>
        </div>
      </div>

      <div className="master-layout">
        <section className="panel master-list">
          <div className="master-search">
            <Search size={15} />
            <input
              value={search}
              placeholder="Search channel, company or GSTIN"
              onChange={(event) => setSearch(event.target.value)}
            />
            <span>{filtered.length}</span>
          </div>
          <div className="master-rows">
            {isLoading && <p className="master-empty">Loading channels…</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="master-empty">No channels match that search.</p>
            )}
            {filtered.map((channel) => (
              <button
                key={channel.id}
                className={`master-row ${draft?.id === channel.id ? "active" : ""}`}
                onClick={() => {
                  setImporting(false);
                  setDraft(toDraft(channel));
                }}
              >
                <span className="master-row-main">
                  <strong>{channel.channel_name}</strong>
                  <small>{channel.legal_company_name || "Legal name not set"}</small>
                </span>
                <span className={`status ${channel.active ? "status-ready" : "status-draft"}`}>
                  {channel.active ? "Active" : "Inactive"}
                </span>
              </button>
            ))}
          </div>
        </section>

        {importing ? (
          <MasterImport kind="channels" onClose={() => setImporting(false)} />
        ) : (
        <section className="panel master-editor">
          {!draft ? (
            <div className="master-placeholder">
              <h2>Select a channel</h2>
              <p>Pick a channel on the left to edit it, or add a new one.</p>
            </div>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{draft.id ? "Editing" : "New channel"}</span>
                  <h2>{draft.channel_name || "Untitled channel"}</h2>
                </div>
                <button className="icon-button" onClick={() => setDraft(null)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="master-form">
                <div className="ro-field-grid">
                  <F label="Channel name" value={draft.channel_name} onChange={(v) => set("channel_name", v)} />
                  <F label="Legal company name" value={draft.legal_company_name} onChange={(v) => set("legal_company_name", v)} />
                  <F label="Address line 1" value={draft.address_line1} onChange={(v) => set("address_line1", v)} />
                  <F label="Address line 2" value={draft.address_line2} onChange={(v) => set("address_line2", v)} />
                  <F label="Address line 3" value={draft.address_line3} onChange={(v) => set("address_line3", v)} />
                  <F label="City" value={draft.city} onChange={(v) => set("city", v)} />
                  <F label="State" value={draft.state} onChange={(v) => set("state", v)} />
                  <F label="State code" value={draft.state_code} onChange={setStateCode} />
                  <F label="PIN code" value={draft.pin_code} onChange={(v) => set("pin_code", v)} />
                  <F label="Place of supply" value={draft.place_of_supply} onChange={(v) => set("place_of_supply", v)} />
                  <F label="PAN" value={draft.pan} onChange={(v) => set("pan", v)} />
                  <F label="GSTIN" value={draft.gstin} onChange={(v) => set("gstin", v)} />
                  <MultiValueField type="email" label="RO email" value={draft.ro_email} onChange={(v) => set("ro_email", v)} />
                  <MultiValueField type="email" label="CC email" value={draft.cc_email} onChange={(v) => set("cc_email", v)} />
                  <MultiValueField label="Contact person" value={draft.contact_person} onChange={(v) => set("contact_person", v)} />
                  <F label="Phone" value={draft.phone} onChange={(v) => set("phone", v)} />
                  <F label="Default nett rate" value={draft.default_nett_rate} onChange={(v) => set("default_nett_rate", v)} type="number" />
                  <F label="Aliases (comma separated)" value={draft.aliases} onChange={(v) => set("aliases", v)} />
                </div>

                <label className="ro-field">
                  <span>Notes</span>
                  <textarea
                    rows={2}
                    value={draft.notes}
                    onChange={(event) => set("notes", event.target.value)}
                  />
                </label>

                <label className="master-check">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) => set("active", event.target.checked)}
                  />
                  <span>Active — available when creating documents</span>
                </label>

                {draft.id ? (
                  <ClientRates channelId={draft.id} />
                ) : (
                  <div className="rate-block">
                    <div className="rate-block-head">
                      <div>
                        <h3>Nett rates</h3>
                        <p>
                          Save this channel first — then you can add client and timeband nett rates
                          here.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="wizard-footer">
                <div className="master-actions-left">
                  {draft.id && (
                    <>
                      {isAdmin && (
                        <button
                          className="app-button danger"
                          disabled={deleteChannel.isPending}
                          onClick={() => setConfirmDelete(true)}
                        >
                          <Trash2 size={14} /> {deleteChannel.isPending ? "Deleting…" : "Delete channel"}
                        </button>
                      )}
                      <button
                        className="app-button secondary"
                        onClick={() =>
                          toggleActive.mutate({ id: draft.id as string, active: !draft.active })
                        }
                      >
                        {draft.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </>
                  )}
                </div>
                <button
                  className="app-button primary"
                  disabled={!draft.channel_name.trim() || saveChannel.isPending}
                  onClick={submit}
                >
                  {saveChannel.isPending ? "Saving…" : "Save channel"}
                </button>
              </div>
              <DeleteConfirmation
                open={confirmDelete}
                itemLabel="channel"
                itemName={draft.channel_name}
                pending={deleteChannel.isPending}
                onOpenChange={setConfirmDelete}
                onConfirm={remove}
              />
            </>
          )}
        </section>
        )}
      </div>
    </div>
  );
}

function ClientRates({ channelId }: { channelId: string }) {
  const { data: rates = [] } = useChannelRates(channelId);
  const { data: clients = [] } = useClients();
  const saveRate = useSaveChannelRate();
  const updateRate = useUpdateChannelRate();
  const deleteRate = useDeleteChannelRate();
  const [clientId, setClientId] = useState("");
  const [rate, setRate] = useState("");
  const [timeband, setTimeband] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [filterClientId, setFilterClientId] = useState("");
  const [programme, setProgramme] = useState("");
  const queryClient = useQueryClient();
  useEffect(() => {
    void pruneRateHistory(channelId)
      .then(() => queryClient.invalidateQueries({ queryKey: ["channel-rates", channelId] }))
      .catch(() => undefined);
  }, [channelId, queryClient]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const visibleRates = rates
    .filter((entry) => !filterClientId || entry.client_id === filterClientId)
    .filter((entry) => statusFilter === "all" || (statusFilter === "active" ? entry.active : !entry.active))
    .filter((entry) => !needle || `${entry.timeband} ${entry.notes} ${entry.client_label}`.toLowerCase().includes(needle))
    .sort((a, b) =>
      Number(b.active) - Number(a.active) ||
      String(a.client_label).localeCompare(String(b.client_label)) ||
      splitRateBand(a.timeband).programme.localeCompare(splitRateBand(b.timeband).programme) ||
      splitRateBand(a.timeband).band.localeCompare(splitRateBand(b.timeband).band) ||
      String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? "")),
    );
  // One line per client + programme + timeband: the current rate and the one before it only.
  const rateGroups = (() => {
    const map = new Map<string, typeof visibleRates>();
    for (const entry of rates) {
      const key = `${entry.client_id ?? ""}|${String(entry.timeband ?? "").trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    const latestFirst = (a: (typeof rates)[number], b: (typeof rates)[number]) =>
      String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? "")) || String(b.created_at).localeCompare(String(a.created_at));
    const visibleIds = new Set(visibleRates.map((entry) => entry.id));
    return [...map.values()]
      .map((list) => {
        const sorted = [...list].sort(latestFirst);
        const current = sorted.find((entry) => entry.active) ?? sorted[0]!;
        const previous = sorted.find((entry) => entry.id !== current.id && String(entry.effective_from ?? "") <= String(current.effective_from ?? "")) ?? null;
        return { current, previous };
      })
      .filter((group) => visibleIds.has(group.current.id))
      .sort((a, b) => visibleRates.indexOf(a.current) - visibleRates.indexOf(b.current));
  })();
  const activeCount = rates.filter((entry) => entry.active).length;
  const programmeCount = new Set(rates.map((entry) => splitRateBand(entry.timeband).programme).filter(Boolean)).size;

  const add = () => {
    if (!clientId || !rate) return;
    const client = clients.find((entry) => entry.id === clientId);
    saveRate.mutate(
      {
        channel_id: channelId,
        client_id: clientId,
        client_label: client?.client_name ?? "",
        nett_rate: Number(rate),
        timeband: joinRateBand(programme, timeband),
        effective_from: from || null,
        effective_to: to || null,
        notes,
      },
      {
        onSuccess: () => {
          setRate("");
          setProgramme("");
          setTimeband("");
          setFrom("");
          setTo("");
          setNotes("");
        },
      },
    );
  };

  return (
    <div className="rate-block">
      <div className="rate-block-head rate-filter-row">
        <h3>Nett rates</h3>
        <label className="ro-field rate-filter">
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Programme, timeband, notes" />
        </label>
        <label className="ro-field rate-filter">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}>
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </label>
        <label className="ro-field rate-filter">
          <span>Filter by client</span>
          <select value={filterClientId} onChange={(event) => setFilterClientId(event.target.value)}>
            <option value="">All clients</option>
            {clients.filter((client) => rates.some((entry) => entry.client_id === client.id)).map((client) => (
              <option key={client.id} value={client.id}>
                {client.client_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table className="rate-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Programme</th>
            <th>Timeband</th>
            <th>Previous<small className="rate-sub">Nett rate</small></th>
            <th>Current<small className="rate-sub">Nett rate</small></th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rateGroups.length === 0 && (
            <tr>
              <td colSpan={7} className="rate-empty">
                {rates.length === 0 ? "No client rates yet." : "No rates match these filters."}
              </td>
            </tr>
          )}
          {rateGroups.map(({ current: entry, previous }) =>
            editing === entry.id ? (
              <tr key={entry.id}>
                <td colSpan={7}>
                  <div className="rate-form">
                    <label className="ro-field">
                      <span>Client</span>
                      <select
                        value={entry.client_id ?? ""}
                        onChange={(event) => {
                          const client = clients.find((item) => item.id === event.target.value);
                          updateRate.mutate({
                            id: entry.id,
                            channelId,
                            patch: {
                              client_id: event.target.value || null,
                              client_label: client?.client_name ?? "",
                            },
                          });
                        }}
                      >
                        <option value="">Any client</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.client_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <BlurF
                      label="Programme"
                      value={splitRateBand(entry.timeband).programme}
                      onChange={(value) =>
                        updateRate.mutate({ id: entry.id, channelId, patch: { timeband: joinRateBand(value, splitRateBand(entry.timeband).band) } })
                      }
                    />
                    <BlurF
                      label="Timeband"
                      value={splitRateBand(entry.timeband).band}
                      onChange={(value) =>
                        updateRate.mutate({ id: entry.id, channelId, patch: { timeband: joinRateBand(splitRateBand(entry.timeband).programme, value) } })
                      }
                    />
                    <BlurF
                      label="Nett rate"
                      type="number"
                      value={String(entry.nett_rate)}
                      onChange={(value) =>
                        updateRate.mutate({
                          id: entry.id,
                          channelId,
                          patch: { nett_rate: Number(value) || 0 },
                        })
                      }
                    />
                    <BlurF
                      label="Effective from"
                      type="date"
                      value={entry.effective_from ?? ""}
                      onChange={(value) =>
                        updateRate.mutate({
                          id: entry.id,
                          channelId,
                          patch: { effective_from: value || null },
                        })
                      }
                    />
                    <BlurF
                      label="Effective to"
                      type="date"
                      value={entry.effective_to ?? ""}
                      onChange={(value) =>
                        updateRate.mutate({
                          id: entry.id,
                          channelId,
                          patch: { effective_to: value || null },
                        })
                      }
                    />
                    <BlurF
                      label="Notes"
                      value={entry.notes ?? ""}
                      onChange={(value) =>
                        updateRate.mutate({ id: entry.id, channelId, patch: { notes: value } })
                      }
                    />
                    <button className="app-button secondary" onClick={() => setEditing(null)}>
                      Done
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={entry.id}>
                <td title={entry.client_label || ""}>{shortClientName(entry.client_label) || "Any client"}</td>
                <td>{splitRateBand(entry.timeband).programme || "—"}</td>
                <td>{splitRateBand(entry.timeband).band || "—"}</td>
                <td>
                  {previous ? (
                    <>
                      {Number(previous.nett_rate).toLocaleString("en-IN")}
                      <small className="rate-prev-dates">{previous.effective_from ?? "—"} to {previous.effective_to ?? "—"}</small>
                    </>
                  ) : "—"}
                </td>
                <td>
                  <strong>{Number(entry.nett_rate).toLocaleString("en-IN")}</strong>
                  <small className="rate-prev-dates">from {entry.effective_from ?? "—"}</small>
                </td>
                <td>
                  <button
                    className="link-button"
                    onClick={() =>
                      updateRate.mutate({
                        id: entry.id,
                        channelId,
                        patch: { active: !entry.active },
                      })
                    }
                  >
                    {entry.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label="Edit rate"
                    onClick={() => setEditing(entry.id)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Remove rate"
                    onClick={() => deleteRate.mutate({ id: entry.id, channelId })}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <div className="rate-form">
        <label className="ro-field">
          <span>Client</span>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">Select client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.client_name}
              </option>
            ))}
          </select>
        </label>
        <F label="Programme" value={programme} onChange={setProgramme} />
        <F label="Timeband" value={timeband} onChange={setTimeband} />
        <F label="Nett rate" value={rate} onChange={setRate} type="number" />
        <F label="Effective from" value={from} onChange={setFrom} type="date" />
        <F label="Effective to" value={to} onChange={setTo} type="date" />
        <F label="Notes" value={notes} onChange={setNotes} />
        <button className="app-button secondary" disabled={!clientId || !rate} onClick={add}>
          <Plus size={15} /> Add client rate
        </button>
      </div>
    </div>
  );
}

function F({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="ro-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function cleanEmails(value: string) {
  return value.split(/[,;]/).map((e) => e.trim()).filter(Boolean).join(", ");
}

/** "G Square Realtors Private Limited" → "G Square": drops company-type words from the end. */
function shortClientName(name: string | null | undefined) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  const stop = /^(realtors?|realty|private|pvt\.?|limited|ltd\.?|llp|properties|property|developers?|constructions?|builders?|projects?|infra(structure)?|homes?|housing|estates?|group|india|enterprises?|ventures?|and|&|co\.?|company)$/i;
  const at = words.findIndex((word, index) => index > 0 && stop.test(word));
  return (at > 0 ? words.slice(0, at) : words).join(" ");
}

// Edits locally while typing and saves once when the box loses focus (or Enter), so typing never waits on the server.
function BlurF({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => {
    if (local !== value) onChange(local);
  };
  return (
    <label className="ro-field">
      <span>{label}</span>
      <input
        type={type}
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}
