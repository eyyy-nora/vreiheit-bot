import {
  Client,
  GuildBan,
  GuildMember,
  Interaction,
  Message,
  Role,
  VoiceState,
} from "discord.js";
import { registerService } from "src/discord/decorators/inject";
import { DiscordHandlerMeta, getMeta } from "src/discord/decorators/meta";
import { PromiseOr } from "src/util";

export type UpdateHandler<T> = (
  oldVal: T | Partial<T>,
  newVal: T,
) => PromiseOr<void>;
export type RegularHandler<T> = (val: T) => PromiseOr<void>;
export type IdHandler<T> = (val: T, ...params: string[]) => PromiseOr<void>;

export interface HandlerMap {
  memberJoin: RegularHandler<GuildMember>[];
  memberLeave: RegularHandler<GuildMember>[];
  memberUpdate: UpdateHandler<GuildMember>[];

  ban: RegularHandler<GuildBan>[];
  unban: RegularHandler<GuildBan>[];

  roleCreate: RegularHandler<Role>[];
  roleDelete: RegularHandler<Role>[];
  roleUpdate: UpdateHandler<Role>[];

  messageCreate: RegularHandler<Message>[];
  messageDelete: RegularHandler<Message>[];
  messageUpdate: UpdateHandler<Message>[];

  init: RegularHandler<Client<true>>[];
  interaction: IdHandler<Interaction>[];
  voiceStateUpdate: UpdateHandler<VoiceState>[];
}

export const registeredHandlers: HandlerMap = emptyHandlerMap();

export function emptyHandlerMap(): HandlerMap {
  return {
    memberJoin: [],
    memberLeave: [],
    memberUpdate: [],
    ban: [],
    unban: [],
    roleCreate: [],
    roleDelete: [],
    roleUpdate: [],
    messageCreate: [],
    messageDelete: [],
    messageUpdate: [],
    init: [],
    interaction: [],
    voiceStateUpdate: [],
  };
}

export function Handler(prefix: string = "") {
  return function (cls: any) {
    const meta = getMeta(cls);
    meta.prefix = prefix;
    const instance = new (cls as any)();
    registerService(cls, instance);
    const handlerMap = createHandlers(instance, meta);
    for (const [key, handlers] of Object.entries(handlerMap))
      registeredHandlers[key].push(...handlers);
  };
}

function createHandlers(instance: any, meta: DiscordHandlerMeta) {
  const { handlers } = meta;
  return Object.fromEntries(
    Object.entries(handlers).map(([key, handlers]) => [
      key,
      handlers.map(handler => handler.bind(instance)),
    ]),
  );
}
