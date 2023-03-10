import {
  ActionRowBuilder,
  BaseGuildTextChannel,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  CommandInteraction,
  EmbedBuilder,
  Guild,
  GuildMember,
  Message,
  SlashCommandBuilder,
  ThreadChannel,
} from "discord.js";
import { dataSource } from "src/database/data-source";
import { ServerMember } from "src/database/entities/server-member";
import { ensureCommand } from "src/discord/commands/ensure-command";
import {
  Handler,
  HasPermission,
  OnCommand,
  OnInit,
  OnMemberUpdate,
  OnMessageCreate,
  OnMessageDelete,
  OnMessageUpdate,
} from "src/discord/decorators";
import {
  getServer,
  getServerMember,
  updateServerMember,
  withServer,
} from "src/discord/members/get-server-member";
import { buildDiff } from "src/util/diff";

@Handler("sus")
export class SuspiciousAccountsService {
  susAccounts: Record<string, string[]> = {};

  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setDMPermission(false)
        .setName("sus")
        .setDescription("Verwalte Suspicious Accounts")
        .addSubcommand(cmd =>
          cmd
            .setName("add")
            .setDescription("Füge einen Suspicious Account hinzu")
            .addUserOption(opt =>
              opt
                .setName("user")
                .setDescription("Die Benutzer*in")
                .setRequired(true),
            )
            .addStringOption(opt =>
              opt
                .setName("reason")
                .setDescription("Begründung für die Markierung")
                .setRequired(false),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("remove")
            .setDescription("Entfernen einen Suspicious Account")
            .addUserOption(opt =>
              opt
                .setName("user")
                .setDescription("Die Benutzer*in")
                .setRequired(true),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("list")
            .setDescription("Liste alle Suspicious Accounts auf"),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("channel")
            .setDescription(
              "Lege den Kanal für Suspicious Account Activity fest",
            )
            .addChannelOption(opt =>
              opt
                .setName("channel")
                .setDescription(
                  "Der Kanal, in dem Suspicious Activity erfasst werden soll.",
                )
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText),
            ),
        ),
    );

    for (const guild of client.guilds.cache.values()) {
      const accs = await dataSource.getRepository(ServerMember).find({
        where: {
          guild: { discordId: guild.id },
          suspect: true,
        },
        select: { discordId: true },
      });
      this.susAccounts[guild.id] = accs.map(it => it.discordId);
    }
  }

  @OnCommand("sus", "add")
  @HasPermission("ModerateMembers")
  async onSusAccountAdd(cmd: CommandInteraction) {
    const user = cmd.options.getUser("user", true);
    const member = cmd.guild.members.cache.get(user.id);
    const reason = cmd.options.get("reason")?.value?.toString();

    const thread = await this.getThread(member, reason ?? undefined);

    if (thread.archived) {
      await thread.setArchived(false);
      await thread.send({
        content: [
          `${member} ist wieder als verdächtig markiert.`,
          reason ? `Grund: ${reason}` : undefined,
        ]
          .filter(it => it)
          .join("\n"),
      });
    }

    await updateServerMember(member, {
      suspect: true,
      suspectThreadId: thread.id,
    });
    this.susAccounts[cmd.guildId].push(user.id);
    await cmd.editReply({
      content: `${member} wurde als verdächtig markiert.`,
    });
  }

  @OnCommand("sus", "remove")
  @HasPermission("ModerateMembers")
  async onSusAccountRemove(cmd: CommandInteraction) {
    const user = cmd.options.getUser("user", true);
    const member = cmd.guild.members.cache.get(user.id);

    await updateServerMember(member, { suspect: false });
    const accs = this.susAccounts[cmd.guildId];
    const index = accs.indexOf(user.id);
    if (index !== -1) accs.splice(index, 1);

    const thread = await this.getThread(member);
    await thread.send({
      content: `${member} ist nicht mehr als verdächtig markiert.`,
    });
    await thread.setArchived(true);
    await cmd.editReply({
      content: `${member} ist nicht mehr als verdächtig markiert.`,
    });
  }

  @OnCommand("sus", "channel")
  @HasPermission("Administrator")
  async onSusChannelSet(cmd: CommandInteraction) {
    const channel = cmd.options.get("channel").channel;
    await withServer(cmd.guildId, server => {
      server.susActivityChannelId = channel.id;
    });
    await cmd.editReply({
      content: `${channel} wurde als Kanal für verdächtige Aktivitäten festgelegt.`,
    });
  }

  @OnCommand("sus", "list")
  @HasPermission("ModerateMembers")
  async onSusAccountList(cmd: CommandInteraction) {
    const users = this.susAccounts[cmd.guildId];
    await cmd.editReply({
      content: `**Hier ist eine Auflistung aller verdächtigen Accounts:**\n\n${users
        .map(it => `<@${it}> (${it})`)
        .join("\n")}`,
    });
  }

  @OnMessageCreate()
  async onMessageCreate(message: Message) {
    if (!(await this.isSus(message.member))) return;
    const thread = await this.getThread(message.member);
    await thread.send({
      embeds: [this.buildMessageEmbed("Nachricht gepostet", message)],
      components: [this.buildMessageActionRow(message)],
    });
  }

  @OnMessageUpdate()
  async onMessageUpdate(oldMsg: Message, newMsg: Message) {
    if (!(await this.isSus(newMsg.member))) return;
    if (oldMsg.cleanContent === newMsg.cleanContent && oldMsg.cleanContent)
      return;
    const thread = await this.getThread(newMsg.member);
    await thread.send({
      embeds: [this.buildMessageEmbed("Nachricht bearbeitet", newMsg, oldMsg)],
      components: [this.buildMessageActionRow(newMsg)],
    });
  }

  @OnMessageDelete()
  async onMessageDelete(message: Message) {
    if (!(await this.isSus(message.member))) return;
    const thread = await this.getThread(message.member);
    await thread.send({
      embeds: [this.buildMessageEmbed("Nachricht gelöscht", message)],
      components: [this.buildMessageActionRow(message)],
    });
  }

  @OnMemberUpdate()
  async onMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
    if (!(await this.isSus(newMember))) return;
    const thread = await this.getThread(newMember);
    thread.send({
      content: `${newMember} hat den Nickname von **${oldMember.displayName}** zu **${newMember.displayName}** geändert.`,
    });
  }

  async isSus(member: GuildMember) {
    return (await getServerMember(member)).suspect;
  }

  async getThread(member: GuildMember, reason?: string) {
    const data = await getServerMember(member);
    if (!data.suspectThreadId) return await this.createThread(member, reason);
    try {
      return (await member.guild.channels.fetch(
        data.suspectThreadId,
      )) as ThreadChannel;
    } catch {
      return await this.createThread(member, reason);
      /* ignore */
    }
  }

  async createThread(member: GuildMember, reason?: string) {
    const channel = await this.getSusChannel(member.guild);

    const message = await channel.send({
      content: [
        `Verdächtiger Account: ${member}`,
        reason ? `Grund: ${reason}` : undefined,
      ]
        .filter(it => it)
        .join("\n"),
    });

    const thread = await channel.threads.create({
      name: `Verdächtiger Account: ${member.displayName}`,
      type: ChannelType.GuildPublicThread,
      startMessage: message,
    });

    await updateServerMember(member, { suspectThreadId: thread.id });
    return thread;
  }

  async getSusChannel(guild: Guild) {
    const server = await getServer(guild.id);
    return (await guild.channels.fetch(
      server.susActivityChannelId,
    )) as BaseGuildTextChannel;
  }

  buildMessageActionRow(message: Message) {
    return new ActionRowBuilder<ButtonBuilder>().setComponents(
      new ButtonBuilder()
        .setLabel("Löschen")
        .setCustomId(`messages:delete:${message.channelId}:${message.id}`)
        .setStyle(ButtonStyle.Danger),
    );
  }

  buildMessageEmbed(title: string, message: Message, old?: Message) {
    let content = buildDiff(
      message.cleanContent.replace(/[*\\_~|]+/g, ""),
      (old?.cleanContent ?? message.cleanContent).replace(/[*\\_~|]+/g, ""),
    );
    if (!content)
      content =
        message.embeds[0]?.url ??
        message.attachments
          .map(attach => {
            return `**Attachment:** ${attach.name}\n**Size:** ${attach.size}\n**Type:** ${attach.contentType}\n**Link:** [link](${attach.url})`;
          })
          .join("\n\n");
    const fields = [
      {
        name: "Kanal",
        value: `${message.channel}`,
        inline: true,
      },
      {
        name: "Nachricht",
        value: `[link](${message.url})`,
        inline: true,
      },
      {
        name: "Author",
        value: `${message.author}`,
        inline: true,
      },
    ];
    return new EmbedBuilder()
      .setURL(message.url)
      .setTitle(title)
      .setFields(fields)
      .setDescription(content);
  }
}
