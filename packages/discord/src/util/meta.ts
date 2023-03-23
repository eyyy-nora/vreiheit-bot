import { Interaction } from "discord.js";

const META = Symbol("discord meta");

export interface DiscordMeta {
  handlers: DiscordHandlerMeta;
  prefix?: string;
}

export interface DiscordHandlerMeta {
  interaction: DiscordInteractionHandler[];
}

export type DiscordInteractionHandler = ({}: {
  interaction: Interaction;
  context: any;
  meta: DiscordMeta;
}) => void;

export function getDiscordMeta(cls: any) {
  return (cls[META] ??= createMeta());
}

function createMeta(): DiscordMeta {
  return {
    handlers: {
      interaction: [],
    },
  };
}

export function prefixedId(prefix?: string, id?: string) {
  if (id && id.startsWith("-")) return id.slice(1);
  if (prefix) return id ? `${prefix}:${id}` : prefix;
  return id ?? "";
}

export function idMatches(toCheck: string, prefix?: string, id?: string) {
  const full = prefixedId(prefix, id);
  return toCheck === full || toCheck.startsWith(`${full}:`);
}

export function remainingId(
  toCheck: string,
  prefix?: string,
  id?: string,
): string[] {
  const full = prefixedId(prefix, id);
  return toCheck
    .slice(full.length + 1)
    .split(":")
    .filter(it => it);
}
