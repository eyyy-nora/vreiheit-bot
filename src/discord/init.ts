import {
  ActivityOptions,
  Base64Resolvable,
  BufferResolvable,
  Client,
  OAuth2Scopes,
  PresenceStatusData,
} from "discord.js";
import { env, sleep } from "src/util";

export const client = new Client({
  intents: [
    "Guilds",
    "GuildIntegrations",
    "GuildMembers",
    "GuildMessages",
    "GuildBans",
    "GuildPresences",
    // "GuildMessageReactions",
    "GuildModeration",
    // "GuildEmojisAndStickers",
    "GuildVoiceStates",
    "DirectMessages",
    "DirectMessageReactions",
    "MessageContent",
  ],
});

let clientLoginPromise: Promise<Client> | undefined;
export async function withClient(): Promise<Client<true>> {
  if (client.isReady()) return client;
  if (clientLoginPromise != null) return clientLoginPromise;
  clientLoginPromise = (client as any)
    .login(env("discord_token"))
    .then(() => client);
  await clientLoginPromise;
  clientLoginPromise = undefined;
  return client;
}

export function generateInvite() {
  return client.generateInvite({
    scopes: [OAuth2Scopes.Bot],
    permissions: ["Administrator"],
  });
}

interface StatusMessage {
  status?: PresenceStatusData;
  activity?: ActivityOptions;
  name?: string;
  avatar?: BufferResolvable | Base64Resolvable | null;
  time?: number;
}

export function cycleStatusMessages(messages: StatusMessage[]) {
  let cancelled = false;
  const cancel = () => (cancelled = true);
  Promise.resolve(async () => {
    while (!cancelled) {
      for (const { status, activity, name, avatar, time = 60 } of messages) {
        if (activity) client.user.setActivity(activity);
        if (status) client.user.setStatus(status);
        if (name) await client.user.setUsername(name);
        if (avatar) await client.user.setAvatar(avatar);
        await sleep(time * 1000);
      }
    }
  }).then();
  return cancel;
}
