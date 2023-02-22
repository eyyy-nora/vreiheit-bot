import {
  ActionRowBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildAuditLogsEntry,
  GuildBan,
  GuildMember,
  Message,
  Role,
  User,
} from "discord.js";
import {
  Handler,
  InjectService,
  OnBanCreate,
  OnBanDelete,
  OnMemberLeave,
  OnMemberUpdate,
  OnMessageDelete,
  OnMessageUpdate,
  OnRoleCreate,
  OnRoleDelete,
  OnRoleUpdate,
} from "src/discord/decorators";
import { modLog } from "src/discord/logging/mod-log";
import { sleep } from "src/util";
import { buildDiff } from "src/util/diff";
import { Pronouns } from "./pronouns";

@Handler()
export class LoggingService {
  @InjectService(() => Pronouns)
  pronouns!: Pronouns;

  @OnMemberUpdate()
  async onMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
    if (oldMember.nickname === newMember.nickname) return;
    const fetchedLogs = await newMember.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberUpdate,
      limit: 5,
    });
    const memberLog: GuildAuditLogsEntry = fetchedLogs.entries.find(
      log => log.executor.id === newMember.id,
    );
    await modLog(newMember.guild, {
      content: `Der Nickname von ${newMember} wurde von **${memberLog.executor.username}#${memberLog.executor.discriminator}** zu **${newMember.displayName}** geändert`,
      components: [],
    });
  }

  @OnRoleCreate()
  async onRoleCreate(role: Role) {
    if (this.isPronounRole(role)) return;
    const fetchedLogs = await role.guild.fetchAuditLogs({
      type: AuditLogEvent.RoleCreate,
      limit: 5,
    });
    const roleLog = fetchedLogs.entries.find(it => it.target.id === role.id);
    if (roleLog?.executor?.bot || !roleLog) return;
    await modLog(role.guild, {
      content: `Die Rolle ${role} wurde von ${roleLog.executor} erstellt`,
      components: [],
    });
  }

  @OnRoleUpdate()
  async onRoleUpdate(oldRole: Role, newRole: Role) {
    if (this.isPronounRole(oldRole)) return;
    if (oldRole.rawPosition !== newRole.rawPosition) return;
    const fetchedLogs = await newRole.guild.fetchAuditLogs({
      type: AuditLogEvent.RoleUpdate,
      limit: 5,
    });
    const roleLog = fetchedLogs.entries.find(it => it.target.id === newRole.id);
    if (roleLog?.executor?.bot || !roleLog) return;
    if (oldRole.name === newRole.name) {
      await modLog(newRole.guild, {
        content: `Die Rolle ${oldRole} wurde von ${roleLog.executor} verändert`,
        components: [],
      });
    } else {
      await modLog(newRole.guild, {
        content: `Die Rolle **@${oldRole.name}** wurde von ${roleLog.executor} zu ${newRole} geändert`,
        components: [],
      });
    }
  }

  @OnRoleDelete()
  async onRoleDelete(role: Role) {
    if (this.isPronounRole(role)) return;
    const fetchedLogs = await role.guild.fetchAuditLogs({
      type: AuditLogEvent.RoleDelete,
      limit: 5,
    });
    const roleLog = fetchedLogs.entries.find(it => it.target.id === role.id);
    if (roleLog?.executor?.bot || !roleLog) return;
    await modLog(role.guild, {
      content: `Die Rolle **@${role.name}** wurde von ${roleLog.executor} gelöscht`,
      components: [],
    });
  }

  @OnBanCreate()
  async onBanCreate(ban: GuildBan) {
    const fetchedLogs = await ban.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberBanAdd,
      limit: 5,
    });
    const match = fetchedLogs.entries.find(it => it.target.id === ban.user.id);
    if (match?.executor?.bot || !match) return;
    await modLog(ban.guild, {
      embeds: [
        new EmbedBuilder()
          .setTitle(`User ${ban.user.tag} wurde verbannt`)
          .setDescription(ban.reason ?? null)
          .setAuthor({
            name: ban.user.tag,
            iconURL: ban.user.displayAvatarURL(),
          })
          .setFields({
            name: "Moderator*in",
            value: `${match.executor}`,
            inline: true,
          }),
      ],
      components: [],
    });
  }

  @OnBanDelete()
  async onBanDelete(unban: GuildBan) {
    const fetchedLogs = await unban.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberBanRemove,
      limit: 5,
    });
    const match = fetchedLogs.entries.find(
      it => it.target.id === unban.user.id,
    );
    if (match?.executor?.bot || !match) return;
    await modLog(unban.guild, {
      embeds: [
        new EmbedBuilder()
          .setTitle(`User ${unban.user.tag} wurde entbannt`)
          .setDescription(unban.reason ?? null)
          .setAuthor({
            name: unban.user.tag,
            iconURL: unban.user.displayAvatarURL(),
          })
          .setFields({
            name: "Moderator*in",
            value: `${match.executor}`,
            inline: true,
          }),
      ],
    });
  }

  @OnMemberLeave()
  async onMemberLeave(member: GuildMember) {
    const now = Date.now();
    const logs = await member.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberKick,
      limit: 5,
    });
    const matches = logs.entries
      .reverse()
      .filter(it => it.target.id === member.id);
    const match = matches.find(it => +it.createdAt >= now - 5000);
    if (!match || match.executor.bot) return;
    await modLog(member.guild, {
      embeds: [
        new EmbedBuilder()
          .setTitle(`Mitglied ${member.user.tag} wurde gekickt`)
          .setDescription(match.reason ?? null)
          .setAuthor({
            name: match.target.tag,
            iconURL: match.target.displayAvatarURL(),
          })
          .setFields({
            name: "Moderator*in",
            value: `${match.executor}`,
            inline: true,
          }),
      ],
    });
  }

  @OnMessageUpdate()
  async onMessageUpdate(oldMessage: Message, newMessage: Message) {
    if (newMessage.author.bot) return;
    if (
      oldMessage.content.toLowerCase().trim() ===
      newMessage.content.toLowerCase().trim()
    )
      return;

    await modLog(newMessage.guild, {
      embeds: [
        this.buildMessageEmbed(`Nachricht bearbeitet`, newMessage, oldMessage),
      ],
      components: [this.buildMessageActionRow(newMessage)],
    });
  }

  @OnMessageDelete()
  async onMessageDelete(message: Message) {
    if (message.author.bot) return;
    await sleep(1000);
    const logs = await message.guild.fetchAuditLogs({
      limit: 5,
      type: AuditLogEvent.MessageDelete,
    });
    const match = logs.entries
      .reverse()
      .find(
        it =>
          it.extra.channel.id === message.channelId &&
          it.target.id === message.author.id,
      );
    if (match?.executor?.bot) return;
    await modLog(message.guild, {
      embeds: [
        this.buildMessageEmbed(
          `Nachricht gelöscht`,
          message,
          undefined,
          !match || match.executor.id === message.author.id
            ? undefined
            : match.executor,
        ),
      ],
    });
  }

  buildMessageActionRow(message: Message) {
    return new ActionRowBuilder<ButtonBuilder>().setComponents(
      new ButtonBuilder()
        .setLabel("Löschen")
        .setCustomId(`messages:delete:${message.channelId}:${message.id}`)
        .setStyle(ButtonStyle.Danger),
    );
  }

  buildMessageEmbed(title: string, message: Message, old?: Message, by?: User) {
    const content = buildDiff(
      message.cleanContent.replace(/[*\\_~|]+/g, ""),
      (old?.cleanContent ?? message.cleanContent).replace(/[*\\_~|]+/g, ""),
    );

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
    if (by && by.id !== message.author.id)
      fields.push({
        name: "Moderator*in",
        value: `${by}`,
        inline: true,
      });

    return new EmbedBuilder()
      .setTitle(title)
      .setURL(message.url)
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL(),
      })
      .setFields(fields)
      .setDescription(content);
  }

  isPronounRole(role: Role) {
    return role.name.startsWith(this.pronouns.prefix());
  }
}
