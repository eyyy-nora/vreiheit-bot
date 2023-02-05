import { Guild, TextChannel } from "discord.js";

export async function findChannel(guild: Guild, channelId: string) {
  return /^[0-9]+$/.test(channelId)
    ? guild.channels.fetch(channelId)
    : guild.channels
        .fetch()
        .then(channels => channels.find(it => it.name === channelId));
}

export async function findTextChannel(guild: Guild, channelId: string) {
  return (await findChannel(guild, channelId)) as TextChannel;
}
