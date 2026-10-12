import { MultiValueField } from "@/components/multi-value-field";
import { Copy, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DeleteConfirmation } from "@/components/delete-confirmation";
import { MasterImport } from "@/components/master-import";
import { MasterExportButton } from "@/components/master-export-button";
import { stateForCode } from "@/lib/gst";

import { useClients, useDeleteClient, useSaveClient, type Client } from "@/lib/master-data";
import { useIsAdmin } from "@/lib/use-is-admin";

type Draft = {
  id?: string;
  client_name: string;
  legal_name: string;
  address_line1: string;
  address_line2: string;
  address_line3: string;
  city: string;
  state: string;
  state_code: string;
  pin_code: string;
  pan: string;
  gstin: string;
  contact_person: string;
  email: string;
  cc_email: string;
  phone: string;
  service_charge_percent: string;
  notes: string;
  courier_address: string;
  active: boolean;
};

const emptyDraft: Draft = {
  client_name: "",
  legal_name: "",
  address_line1: "",
  address_line2: "",
  address_line3: "",
  city: "",
  state: "Tamil Nadu",
  state_code: "33",
  pin_code: "",
  pan: "",
  gstin: "",
  contact_person: "",
  email: "",
  cc_email: "",
  phone: "",
  service_charge_percent: "",
  notes: "",
  courier_address: "",
  active: true,
};

function toDraft(client: Client): Draft {
  return {
    id: client.id,
    client_name: client.client_name,
    legal_name: client.legal_name,
    address_line1: client.address_line1,
    address_line2: client.address_line2,
    address_line3: client.address_line3,
    city: client.city,
    state: client.state,
    state_code: client.state_code,
    pin_code: client.pin_code,
    pan: client.pan,
    gstin: client.gstin,
    contact_person: client.contact_person,
    email: client.email,
    cc_email: client.cc_email ?? "",
    phone: client.phone,
    service_charge_percent:
      client.service_charge_percent == null ? "" : String(client.service_charge_percent),
    notes: client.notes,
    courier_address: client.courier_address ?? "",
    active: client.active,
  };
}

export function ClientMaster() {
  const { data: clients = [], isLoading } = useClients();
  const saveClient = useSaveClient();
  const deleteClient = useDeleteClient();
  const isAdmin = useIsAdmin();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return clients;
    return clients.filter((client) =>
      [client.client_name, client.legal_name, client.gstin].join(" ").toLowerCase().includes(key),
    );
  }, [clients, search]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  /** Typing a GST state code fills the state name automatically; it stays editable. */
  const setStateCode = (value: string) => {
    const name = stateForCode(value);
    setDraft((prev) => (prev ? { ...prev, state_code: value, ...(name ? { state: name } : {}) } : prev));
  };

  const submit = () => {
    if (!draft?.client_name.trim()) return;
    saveClient.mutate(
      {
        ...(draft.id ? { id: draft.id } : {}),
        client_name: draft.client_name.trim(),
        legal_name: draft.legal_name.trim() || draft.client_name.trim().toUpperCase(),
        address_line1: draft.address_line1,
        address_line2: draft.address_line2,
        address_line3: draft.address_line3,
        city: draft.city,
        state: draft.state,
        state_code: draft.state_code,
        pin_code: draft.pin_code,
        pan: draft.pan.trim().toUpperCase(),
        gstin: draft.gstin.trim().toUpperCase(),
        contact_person: draft.contact_person,
        email: draft.email,
        cc_email: draft.cc_email,
        phone: draft.phone,
        service_charge_percent:
          draft.service_charge_percent === "" ? null : Number(draft.service_charge_percent),
        notes: draft.notes,
        courier_address: draft.courier_address,
        active: draft.active,
      },
      { onSuccess: (saved) => setDraft(toDraft(saved as Client)) },
    );
  };

  const remove = () => {
    if (!draft?.id) return;
    deleteClient.mutate(draft.id, {
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
          <h1>Clients</h1>
          <p>Billing names, addresses and tax details used on proformas and invoices.</p>
        </div>
        <div className="master-actions-left">
          <MasterExportButton kind="clients" />
          <button className="app-button secondary" onClick={() => { setDraft(null); setImporting(true); }}>
            <Upload size={17} /> Import Excel
          </button>
          <button
            className="app-button primary"
            onClick={() => {
              setImporting(false);
              setDraft({ ...emptyDraft });
            }}
          >
            <Plus size={17} /> Add client
          </button>
        </div>
      </div>

      <div className="master-layout">
        <section className="panel master-list">
          <div className="master-search">
            <Search size={15} />
            <input
              value={search}
              placeholder="Search client or GSTIN"
              onChange={(event) => setSearch(event.target.value)}
            />
            <span>{filtered.length}</span>
          </div>
          <div className="master-rows">
            {isLoading && <p className="master-empty">Loading clients…</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="master-empty">No clients match that search.</p>
            )}
            {filtered.map((client) => (
              <button
                key={client.id}
                className={`master-row ${draft?.id === client.id ? "active" : ""}`}
                onClick={() => {
                  setImporting(false);
                  setDraft(toDraft(client));
                }}
              >
                <span className="master-row-main">
                  <strong>{client.client_name}</strong>
                  <small>{client.gstin || "GSTIN not set"}</small>
                </span>
                <span className={`status ${client.active ? "status-ready" : "status-draft"}`}>
                  {client.active ? "Active" : "Inactive"}
                </span>
              </button>
            ))}
          </div>
        </section>

        {importing ? (
          <MasterImport kind="clients" onClose={() => setImporting(false)} />
        ) : (
        <section className="panel master-editor">
          {!draft ? (
            <div className="master-placeholder">
              <h2>Select a client</h2>
              <p>Pick a client on the left to edit it, or add a new one.</p>
            </div>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{draft.id ? "Editing" : "New client"}</span>
                  <h2>{draft.client_name || "Untitled client"}</h2>
                </div>
                <button className="icon-button" onClick={() => setDraft(null)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="master-form">
                <div className="ro-field-grid">
                  <F label="Client name" value={draft.client_name} onChange={(v) => set("client_name", v)} />
                  <F label="Legal name (as billed)" value={draft.legal_name} onChange={(v) => set("legal_name", v)} />
                  <F label="Address line 1" value={draft.address_line1} onChange={(v) => set("address_line1", v)} />
                  <F label="Address line 2" value={draft.address_line2} onChange={(v) => set("address_line2", v)} />
                  <F label="Address line 3" value={draft.address_line3} onChange={(v) => set("address_line3", v)} />
                  <F label="City" value={draft.city} onChange={(v) => set("city", v)} />
                  <F label="State" value={draft.state} onChange={(v) => set("state", v)} />
                  <F label="State code" value={draft.state_code} onChange={setStateCode} />
                  <F label="PIN code" value={draft.pin_code} onChange={(v) => set("pin_code", v)} />
                  <F label="PAN" value={draft.pan} onChange={(v) => set("pan", v)} />
                  <F label="GSTIN" value={draft.gstin} onChange={(v) => set("gstin", v)} />
                  <F label="Phone" value={draft.phone} onChange={(v) => set("phone", v)} />
                  <MultiValueField type="email" label="To email" value={draft.email} onChange={(v) => set("email", v)} />
                  <MultiValueField type="email" label="CC email" value={draft.cc_email} onChange={(v) => set("cc_email", v)} />
                  <MultiValueField label="Contact person" value={draft.contact_person} onChange={(v) => set("contact_person", v)} />
                  <F label="Service charge %" type="number" value={draft.service_charge_percent} onChange={(v) => set("service_charge_percent", v)} />
                </div>

                <label className="ro-field">
                  <span>Notes</span>
                  <textarea
                    rows={2}
                    value={draft.notes}
                    onChange={(event) => set("notes", event.target.value)}
                  />
                </label>

                <label className="ro-field">
                  <span>Courier address (for printing and sticking on the cover)</span>
                  <textarea
                    rows={5}
                    placeholder={"Name\nCompany\nAddress line\nCity - PIN\nPhone"}
                    value={draft.courier_address}
                    onChange={(event) => set("courier_address", event.target.value)}
                  />
                </label>
                <div className="master-actions-left">
                  <button
                    className="app-button"
                    disabled={!draft.courier_address.trim()}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(draft.courier_address.trim());
                        toast.success("Courier address copied");
                      } catch {
                        toast.error("Could not copy — select the text and copy manually");
                      }
                    }}
                  >
                    <Copy size={14} /> Copy courier address
                  </button>
                </div>

                <label className="master-check">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) => set("active", event.target.checked)}
                  />
                  <span>Active</span>
                </label>
              </div>

              <div className="wizard-footer">
                <span>Saved clients appear in Manual RO, Proforma and Invoice.</span>
                <div className="master-actions-left">
                  {draft.id && isAdmin && (
                    <button
                      className="app-button danger"
                      disabled={deleteClient.isPending}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 size={14} /> {deleteClient.isPending ? "Deleting…" : "Delete client"}
                    </button>
                  )}
                  <button
                    className="app-button primary"
                    disabled={!draft.client_name.trim() || saveClient.isPending}
                    onClick={submit}
                  >
                    {saveClient.isPending ? "Saving…" : "Save client"}
                  </button>
                </div>
              </div>
              <DeleteConfirmation
                open={confirmDelete}
                itemLabel="client"
                itemName={draft.client_name}
                pending={deleteClient.isPending}
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
