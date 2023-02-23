import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChannelType,
  Client,
  CommandInteraction,
  EmbedBuilder,
  Guild,
  GuildTextBasedChannel,
  MessageCreateOptions,
  MessageEditOptions,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextBasedChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { dataSource } from "src/database/data-source";
import { ManagedMessage } from "src/database/entities/managed-message";
import { ensureCommand } from "src/discord/commands/ensure-command";
import {
  Handler,
  HasPermission,
  OnAutocomplete,
  OnCommand,
  OnFormSubmit,
  OnInit,
} from "src/discord/decorators";
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
        )
        .addSubcommand(cmd =>
          cmd
            .setName("create")
            .setDescription("Erstellt eine neue bearbeitbare Nachricht")
            .addStringOption(option =>
              option
                .setName("tag")
                .setDescription("Tag der bearbeitbaren Nachricht")
                .setRequired(true),
            )
            .addStringOption(option =>
              option
                .setName("content")
                .setDescription("Der Inhalt der Nachricht")
                .setRequired(false),
            )
            .addStringOption(option =>
              option
                .setName("type")
                .setDescription("Der Typ der Nachricht")
                .setRequired(false)
                .addChoices(
                  {
                    name: "Einbettung",
                    value: "embed",
                  },
                  {
                    name: "Inhalt",
                    value: "content",
                  },
                ),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("post")
            .setDescription(
              "Sende eine bearbeitbare Nachricht (und lösche sie an anderer Stelle)",
            )
            .addStringOption(option =>
              option
                .setName("tag")
                .setDescription("Tag der bearbeitbaren Nachricht")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addChannelOption(opt =>
              opt
                .setName("channel")
                .setDescription(
                  "Der Channel, in dem die Nachricht gepostet werden soll",
                )
                .setRequired(false)
                .addChannelTypes(
                  ChannelType.PublicThread,
                  ChannelType.AnnouncementThread,
                  ChannelType.PrivateThread,
                  ChannelType.GuildText,
                  ChannelType.GuildNews,
                ),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("delete")
            .setDescription("Lösche eine bearbeitbare Nachricht")
            .addStringOption(option =>
              option
                .setName("tag")
                .setDescription("Tag der zu löschenden Nachricht")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        ),
    );

    for (const guild of client.guilds.cache.values())
      await this.refreshMessages(guild);
  }

  @OnAutocomplete("managed-message", "tag")
  async onAutocompleteTag(
    auto: AutocompleteInteraction,
    option: any,
    value: string,
  ) {
    const options = (this.messages[auto.guildId] ?? [])
      .filter(it => it.tag.includes(value))
      .map(it => ({
        name: it.tag,
        value: it.tag,
      }));
    await auto.respond(options);
  }

  @OnCommand("managed-message", "get")
  @HasPermission("ManageMessages")
  async onCommandGet(cmd: CommandInteraction) {
    const tag = cmd.options.get("tag").value as string;
    let msg: any = await this.getContent(cmd.guild, tag);
    if (/^[{[]/.test(msg))
      msg = {
        embeds: [
          new EmbedBuilder().setDescription(`\`\`\`markdown\n${msg}\n\`\`\``),
        ],
      };
    await cmd.editReply(msg);
  }

  @OnCommand("managed-message", "delete")
  @HasPermission("ManageMessages")
  async onCommandDelete(cmd: CommandInteraction) {
    const tag = cmd.options.get("tag")?.value as string;
    await this.deleteMessage(cmd.guild, tag);
    await cmd.editReply({
      content: `Nachricht wurde gelöscht.`,
    });
  }

  @OnCommand("managed-message", "refresh")
  @HasPermission("ManageMessages")
  async onCommandRefresh(cmd: CommandInteraction) {
    const tag = cmd.options.get("tag")?.value as string;
    await this.refreshMessages(cmd.guild, tag);
    await cmd.editReply({
      content: `Nachricht${tag ? "" : "en"} neu geladen.`,
    });
  }

  @OnCommand("managed-message", "post")
  @HasPermission("ManageMessages")
  async onCommandPost(cmd: CommandInteraction) {
    const tag = cmd.options.get("tag").value as string;
    const channel = (cmd.options.get("channel")?.channel ??
      cmd.channel) as GuildTextBasedChannel;
    await this.replaceMessage(cmd.guild, channel, tag);
    await cmd.editReply({ content: "Nachricht verschickt!" });
  }

  @OnCommand("managed-message", "edit")
  @OnCommand("managed-message", "create")
  async onCommandEditOrCreate(cmd: CommandInteraction) {
    const tag = cmd.options.get("tag").value as string;
    const content = cmd.options.get("content")?.value as string;
    const type =
      (cmd.options.get("type")?.value as string) ?? content?.length >= 2000
        ? "embed"
        : "content";
    if (!content) {
      await cmd.showModal(await this.createMessageForm(cmd.guild, tag, type));
    } else {
      await cmd.deferReply({ ephemeral: true });
      if (!cmd.memberPermissions.has("ManageMessages"))
        return await cmd.editReply({
          content: "Du hast keine Berechtigung dazu, dies zu tun.",
        });
      await this.editMessage(
        cmd.guild,
        tag,
        content,
        content.length >= 2000 ? "embed" : "content",
      );
      await cmd.editReply({ content: "Nachricht wurde bearbeitet" });
    }
  }

  @OnFormSubmit("edit")
  @HasPermission("ManageMessages")
  async onFormEdit(
    form: ModalSubmitInteraction,
    tag: string,
    type: "content" | "embed",
  ) {
    let content = form.fields.getTextInputValue("content");
    content = this.replaceEmbedBuilderCode(content);
    try {
      await this.editMessage(
        form.guild,
        tag,
        content,
        content.length >= 2000 ? "embed" : type,
      );
      await form.editReply({ content: "Nachricht wurde bearbeitet" });
    } catch (e) {
      await form.editReply({ content: e.message });
    }
  }

  async createMessageForm(guild: Guild, tag: string, type: string) {
    return new ModalBuilder()
      .setTitle(`Bearbeite '${tag}'`)
      .setCustomId(`managed-message:edit:${tag}:${type}`)
      .setComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setLabel("Inhalt")
            .setRequired(true)
            .setStyle(TextInputStyle.Paragraph)
            .setCustomId("content")
            .setValue(await this.getContent(guild, tag)),
        ),
      );
  }

  async refreshMessages(guild: Guild, tag?: string) {
    if (tag) {
      const entity = await this.repo.findOne({
        where: { guild: { discordId: guild.id }, tag },
      });
      this.messages[guild.id] = this.messages[guild.id].map(it =>
        it.id === entity.id ? entity : it,
      );
    } else
      this.messages[guild.id] = await this.repo.find({
        where: { guild: { discordId: guild.id } },
      });
  }

  async getManagedMessage(guild: Guild | string, id: string) {
    return (
      this.messages[typeof guild === "string" ? guild : guild.id]?.find(
        it => it.id === id || it.tag === id,
      ) ??
      (await this.repo.findOne({
        where: {
          guild: { discordId: typeof guild === "string" ? guild : guild.id },
          tag: id,
        },
      }))
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

  async getContent(guild: Guild | string, id: string) {
    return (await this.getManagedMessage(guild, id))?.content || "";
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

  async deleteMessage(guild: Guild, tag: string) {
    const message = await this.getManagedMessage(guild, tag);
    if (message.channelId && message.messageId) {
      const channel = (await guild.channels.fetch(
        message.channelId,
      )) as TextBasedChannel;
      await channel.messages.delete(message.messageId);
    }
    await this.repo.delete({ id: message.id });
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
    const message = await this.getManagedMessage(guild.id, id);
    if (!message) return this.createMessage(guild, channel, id, content!);
    content = this.normaliseContent(message, content);
    if (typeof channel === "string")
      channel = (await guild.channels.fetch(channel)) as TextBasedChannel;
    if (message.channelId && message.messageId) {
      try {
        const prevChannel =
          message.channelId !== channel.id
            ? ((await guild.channels.fetch(
                message.channelId,
              )) as TextBasedChannel)
            : channel;
        const prevMessage = await prevChannel?.messages?.fetch(
          message.messageId,
        );
        await prevMessage?.delete();
      } catch (e) {
        /* ignore */
      }
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
    if (typeof content === "string") {
      if (/^[{[]/.test(content)) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return { embeds: parsed };
        else return { embeds: [parsed] };
      }
      if (message.type === "content") return { content };
      else return { embeds: [new EmbedBuilder().setDescription(content)] };
    } else return content ?? this.normaliseContent(message, message.content);
  }

  content(message: Partial<MessageEditOptions>) {
    if (message.content) return message.content;
    if (message.embeds)
      if (!message.embeds.length) return "";
      else return JSON.stringify(message.embeds, null, 2);
    return "";
  }

  replaceEmbedBuilderCode(content: string) {
    if (!content.startsWith("const lib = require")) return content;
    const firstIndex = content.indexOf("[", content.indexOf("messages.create"));
    const lastIndex = content.lastIndexOf("]");
    content = content.slice(firstIndex, lastIndex + 1);
    return content
      .replace(
        /"color": 0x([0-9A-Fa-f]{6})/g,
        (_, color) => `"color": ${parseInt(color, 16)}`,
      )
      .replace(/`/g, '"');
  }
}
