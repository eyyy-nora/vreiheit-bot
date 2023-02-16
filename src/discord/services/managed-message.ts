import {
  Client,
  Guild,
  MessageCreateOptions,
  MessageEditOptions,
  TextBasedChannel,
} from "discord.js";
import { dataSource } from "src/database/data-source";
import { ManagedMessage } from "src/database/entities/managed-message";
import { Handler, OnInit } from "src/discord/decorators";
import { getServer } from "src/discord/members/get-server-member";

@Handler("managed-message")
export class ManagedMessageService {
  messages: Record<string, ManagedMessage[]> = {};

  get repo() {
    return dataSource.getRepository(ManagedMessage);
  }

  @OnInit()
  async onInit(client: Client<true>) {
    for (const guild of client.guilds.cache.values()) {
      this.messages[guild.id] = await this.repo.find({
        where: { guild: { discordId: guild.id } },
      });
    }
  }

  getManagedMessage(guild: Guild | string, id: string) {
    return this.messages[typeof guild === "string" ? guild : guild.id].find(
      it => it.id === id || it.tag === id,
    );
  }

  async getOrCreateManagedMessage(guild: Guild | string, id: string) {
    const guildId = typeof guild === "string" ? guild : guild.id;
    const match = this.messages[guildId].find(
      it => it.id === id || it.tag === id,
    );
    if (match) return match;
    const server = await getServer(guildId);
    return this.repo.create({ guild: server, tag: id });
  }

  getContent(guild: Guild | string, id: string) {
    return this.getManagedMessage(guild, id)?.content || "";
  }
  async editMessage(
    guild: Guild,
    id: string,
    content: MessageEditOptions | string,
  ) {
    if (typeof content === "string") content = { content };
    const message = await this.getOrCreateManagedMessage(guild, id);
    message.content = content.content;
    if (message.channelId && message.messageId) {
      const channel = (await guild.channels.fetch(
        message.channelId,
      )) as TextBasedChannel;
      const msg = await channel.messages.fetch(message.messageId);
      await msg.edit(content);
    }
    await this.repo.save(message);
  }

  async createMessage(
    guild: Guild,
    channel: string | TextBasedChannel,
    id: string,
    content: MessageCreateOptions | string,
  ) {
    if (typeof content === "string") content = { content };
    if (typeof channel === "string")
      channel = (await guild.channels.fetch(channel)) as TextBasedChannel;
    const server = await getServer(guild.id);
    const message = this.repo.create({
      content: content.content,
      channelId: channel.id,
      guild: server,
      tag: id,
    });
    const { id: messageId } = await channel.send(content);
    message.messageId = messageId;
    await this.repo.save(message);
    (this.messages[guild.id] ??= []).push(message);
  }

  async replaceMessage(
    guild: Guild,
    channel: string | TextBasedChannel,
    id: string,
    content?: MessageEditOptions | string,
  ) {
    const message = this.getManagedMessage(guild.id, id);
    if (!message) return this.createMessage(guild, channel, id, content!);
    if (typeof content === "string") content = { content };
    if (typeof channel === "string")
      channel = (await guild.channels.fetch(channel)) as TextBasedChannel;
    const prevChannel =
      message.channelId !== channel.id
        ? ((await guild.channels.fetch(message.channelId)) as TextBasedChannel)
        : channel;
    const prevMessage = await prevChannel.messages.fetch(message.messageId);
    await prevMessage.delete();
    message.content = content.content;
    const { id: messageId } = await channel.send(content);
    message.messageId = messageId;
    await this.repo.save(message);
  }
}
