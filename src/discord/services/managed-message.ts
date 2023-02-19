import {
  Client,
  EmbedBuilder,
  Guild,
  MessageCreateOptions,
  MessageEditOptions,
  SlashCommandBuilder,
  TextBasedChannel,
} from "discord.js";
import { dataSource } from "src/database/data-source";
import { ManagedMessage } from "src/database/entities/managed-message";
import { ensureCommand } from "src/discord/commands/ensure-command";
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
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("managed-message")
        .setDescription("Verwalte bearbeitbare nachrichten.")
        .setDMPermission(false)
        .addSubcommand(cmd =>
          cmd
            .setName("refresh")
            .setDescription(
              "Lade die bearbeitbaren Nachrichten für diesen Server neu",
            )
            .addStringOption(option =>
              option
                .setName("tag")
                .setDescription("Tag der bearbeitbaren Nachricht")
                .setRequired(false)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("get")
            .setDescription(
              "Zeige den Inhalt einer bearbeitbaren Nachricht an.",
            )
            .addStringOption(option =>
              option
                .setName("tag")
                .setDescription("Tag der bearbeitbaren Nachricht")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("edit")
            .setDescription(
              "Bearbeitet den Inhalt einer bearbeitbaren Nachricht",
            )
            .addStringOption(option =>
              option
                .setName("tag")
                .setDescription("Tag der bearbeitbaren Nachricht")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption(option =>
              option
                .setName("content")
                .setDescription("Neuer Inhalt der Nachricht")
                .setRequired(false),
            ),
        ),
    );

    for (const guild of client.guilds.cache.values())
      await this.refreshMessages(guild);
  }

  async refreshMessages(guild: Guild) {
    this.messages[guild.id] = await this.repo.find({
      where: { guild: { discordId: guild.id } },
    });
  }

  getManagedMessage(guild: Guild | string, id: string) {
    return this.messages[typeof guild === "string" ? guild : guild.id]?.find(
      it => it.id === id || it.tag === id,
    );
  }

  async getOrCreateManagedMessage(
    guild: Guild | string,
    id: string,
    type: "content" | "embed" = "content",
  ) {
    const guildId = typeof guild === "string" ? guild : guild.id;
    const match = this.messages[guildId].find(
      it => it.id === id || it.tag === id,
    );
    if (match) return match;
    const server = await getServer(guildId);
    return this.repo.create({ guild: server, tag: id, type });
  }

  getContent(guild: Guild | string, id: string) {
    return this.getManagedMessage(guild, id)?.content || "";
  }
  async editMessage(
    guild: Guild,
    id: string,
    content: MessageEditOptions | string,
    type: "content" | "embed" = "content",
  ) {
    const message = await this.getOrCreateManagedMessage(guild, id, type);
    content = this.normaliseContent(message, content);
    message.content = this.content(content);
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
    type: "content" | "embed" = "content",
  ) {
    content = this.normaliseContent({ type } as ManagedMessage, content);
    if (typeof channel === "string")
      channel = (await guild.channels.fetch(channel)) as TextBasedChannel;
    const server = await getServer(guild.id);
    const message = this.repo.create({
      content: content.content,
      channelId: channel.id,
      guild: server,
      tag: id,
      type,
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
    content = this.normaliseContent(message, content);
    if (typeof channel === "string")
      channel = (await guild.channels.fetch(channel)) as TextBasedChannel;
    if (message.channelId && message.messageId) {
      const prevChannel =
        message.channelId !== channel.id
          ? ((await guild.channels.fetch(
              message.channelId,
            )) as TextBasedChannel)
          : channel;
      const prevMessage = await prevChannel?.messages?.fetch(message.messageId);
      await prevMessage?.delete();
    }
    message.content = this.content(content);
    const { id: messageId } = await channel.send(content);
    message.messageId = messageId;
    message.channelId = channel.id;
    await this.repo.save(message);
  }

  normaliseContent(
    message: ManagedMessage,
    content: string | MessageEditOptions | MessageCreateOptions,
  ): MessageEditOptions {
    return typeof content === "string"
      ? message.type === "content"
        ? { content }
        : { embeds: [new EmbedBuilder().setDescription(content)] }
      : content;
  }

  content(message: Partial<MessageEditOptions>) {
    if (message.content) return message.content;
    if (message.embeds)
      if (!message.embeds.length) return "";
      else if ("data" in message.embeds[0])
        return (message.embeds[0].data as any).description;
      else if ("description" in message.embeds[0])
        return message.embeds[0].description;
    return "";
  }
}
