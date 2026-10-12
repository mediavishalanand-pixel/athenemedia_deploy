import {
  effectiveRate,
  joinRateBand,
  matchChannelRow,
  type Channel,
  type ChannelClientRate,
  type Client,
} from "./master-data";
import type { PlanChannelGroup } from "./plan-import";
import { findStationChannel } from "./channel-match";
import type { RateChange } from "./master-data";

const bandOf = (row: { timeband: string; startTime: string; endTime: string }) =>
  (row.timeband || [row.startTime, row.endTime].filter(Boolean).join(" to ")).trim();

/**
 * Compares the nett rates in a plan against the saved client rates for each channel.
 * Anything different (or missing) comes back as a proposed rate change.
 *
 * Only TV and Radio are rate-learned: those are bought on saved timeband rates that
 * need confirming. Print, Event, OTT / Digital and OOH rates are taken straight from
 * the plan, so they never raise a rate change for confirmation.
 */
export function detectRateChanges(options: {
  groups: PlanChannelGroup[];
  channels: Channel[];
  rates: ChannelClientRate[];
  client: Client | null | undefined;
  effectiveFrom: string;
}): RateChange[] {
  const { groups, channels, rates, client, effectiveFrom } = options;
  if (!client) return [];

  const changes: RateChange[] = [];
  const seen = new Set<string>();

  groups.forEach((group) => {
    if (group.media !== "tv" && group.media !== "radio") return;
    // Radio: each station ("Suryan FM / Coimbatore") keeps its own rate on its own
    // master; only fall back to the all-over master when no station master exists.
    const channelRow =
      group.media === "radio" && group.station
        ? findStationChannel(group.channel, group.station, channels, (channel) => [
            channel.channel_name,
            ...(channel.aliases ?? []),
          ])
        : matchChannelRow(group.channel, channels);
    if (!channelRow) return;
    group.rows.forEach((row) => {
      const planRate = Number(row.nettRate) || 0;
      if (!planRate) return;


      // Programme-wise: a channel can price programmes in the same timeband differently.
      const timeband = joinRateBand(String((row as { program?: string }).program ?? ""), bandOf(row));
      const dedupe = `${channelRow.id}|${timeband.toLowerCase()}|${planRate}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);

      const current = effectiveRate(rates, {
        channelId: channelRow.id,
        clientId: client.id,
        timeband,
        onDate: effectiveFrom,
      });
      const currentRate = current ? Number(current.nett_rate) : null;
      if (currentRate != null && Math.abs(currentRate - planRate) < 0.005) return;

      changes.push({
        channelId: channelRow.id,
        channelName: channelRow.channel_name,
        clientId: client.id,
        clientLabel: client.client_name,
        timeband,
        previousRateId: current?.id ?? null,
        previousRate: currentRate,
        newRate: planRate,
        effectiveFrom,
      });
    });
  });

  return changes;
}
