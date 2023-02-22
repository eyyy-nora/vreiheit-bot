import {
  Client,
  CommandInteraction,
  Guild,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import { ensureCommand } from "src/discord/commands/ensure-command";
import {
  Handler,
  InjectService,
  OnCommand,
  OnInit,
  OnMemberJoin,
  OnMemberLeave,
  OnMemberUpdate,
} from "src/discord/decorators";
import { ServerMember } from "src/database/entities/server-member";
import { dataSource } from "src/database/data-source";
import {
  getServer,
  getServerMember,
  updateServerMember,
  withServer,
  withServerMember,
} from "src/discord/members/get-server-member";
import { I18nService } from "src/discord/services/i18n";
import { sleep } from "src/util";
import { getSingleCached } from "src/util/caches";
import { createPagingQuery } from "src/util/repos";
import { IsNull, LessThan } from "typeorm";

@Handler("hierarchy")
export class HierarchyService {
  hierarchies: Record<string, string[]> = {};

  @InjectService(() => I18nService)
  i18n!: I18nService;

  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setDMPermission(false)
        .setName("set-newcomer-role")
        .setDescription("Setzt die Rolle für neu beigetretene Benutzer*innen")
        .addRoleOption(builder =>
          builder.setName("role").setRequired(true).setDescription("Role"),
        ),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setDMPermission(false)
        .setName("set-bot-role")
        .setDescription("Setzt die Rolle für Bots")
        .addRoleOption(builder =>
          builder.setName("role").setRequired(true).setDescription("Role"),
        ),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setDMPermission(false)
        .setName("set-speaker-role")
        .setDescription("Setzt die Rolle für Menschen, die sprechen dürfen")
        .addRoleOption(builder =>
          builder.setName("role").setRequired(true).setDescription("Role"),
        ),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setDMPermission(false)
        .setName("set-hierarchy")
        .setDescription("Setzt die Rank-Abfolge fest")
        .addRoleOption(builder =>
          builder.setName("top1").setRequired(true).setDescription("Oberste"),
        )
        .addRoleOption(builder =>
          builder.setName("top2").setRequired(false).setDescription("Zweite"),
        )
        .addRoleOption(builder =>
          builder.setName("top3").setRequired(false).setDescription("Dritte"),
        )
        .addRoleOption(builder =>
          builder.setName("top4").setRequired(false).setDescription("Vierte"),
        )
        .addRoleOption(builder =>
          builder.setName("top5").setRequired(false).setDescription("Fünfte"),
        )
        .addRoleOption(builder =>
          builder.setName("top6").setRequired(false).setDescription("Sechste"),
        )
        .addRoleOption(builder =>
          builder.setName("top7").setRequired(false).setDescription("Siebte"),
        )
        .addRoleOption(builder =>
          builder.setName("top8").setRequired(false).setDescription("Achte"),
        )
        .addRoleOption(builder =>
          builder.setName("top9").setRequired(false).setDescription("Neunte"),
        )
        .addRoleOption(builder =>
          builder.setName("top10").setRequired(false).setDescription("Zehnte"),
        ),
    );
    for (const guild of client.guilds.cache.values())
      await this.initData(guild);

    // await this.everyTenMinutes(client);
    // setInterval(this.everyTenMinutes.bind(this, client), 3600000);
  }

  async everyTenMinutes(client: Client<true>) {
    const twoDaysPast = new Date(+new Date() - 86400000);
    for (const guild of client.guilds.cache.values()) {
      const speakerRole = await this.speakerRole(guild);
      const newComerRole = await this.newComerRole(guild);
      for await (const users of createPagingQuery(
        ServerMember,
        {
          where: {
            createdAt: LessThan(twoDaysPast),
            leftAt: IsNull(),
            guild: { discordId: guild.id },
          },
          relations: ["guild"],
        },
        10,
      )) {
        for (const user of users) {
          const member = await getSingleCached(guild.members, user.discordId);
          if (!member) {
            user.leftAt = new Date();
            continue;
          }
          if (
            !user.pronouns ||
            !user.hierarchyRole ||
            user.hierarchyRole === newComerRole ||
            !user.rulesAccepted
          ) {
            if (user.reminded) continue;
            /*await sendDm(member, {
              content: this.i18n.getDict("guild.join.reminder", {
                user: member,
                channel: this.rulesChannel[guild.id] ?? "regeln",
              }),
            });*/
            user.reminded = true;
            continue;
          }
          if (speakerRole && !user.maySpeak) {
            await member.roles.add(speakerRole);
            user.maySpeak = true;
          }
        }
        if (users.length)
          await dataSource.getRepository(ServerMember).save(users);
        await sleep(60000);
      }
    }
  }

  @OnCommand("set-newcomer-role")
  async onSetNewcomerRole(command: CommandInteraction) {
    if (!command.memberPermissions.has("Administrator")) return;
    await command.deferReply();
    await command.deleteReply();
    const { role } = command.options.get("role", true);
    await withServer(command.guildId, server => {
      server.newComerRoleId = role.id;
    });
  }

  @OnCommand("set-speaker-role")
  async onSetSpeakerRole(command: CommandInteraction) {
    if (!command.memberPermissions.has("Administrator")) return;
    await command.deferReply();
    await command.deleteReply();
    const { role } = command.options.get("role", true);
    await withServer(command.guildId, server => {
      server.speakerRoleId = role.id;
    });
  }

  @OnCommand("set-bot-role")
  async onSetBotRole(command: CommandInteraction) {
    if (!command.memberPermissions.has("Administrator")) return;
    await command.deferReply();
    await command.deleteReply();
    const { role } = command.options.get("role", true);
    await withServer(command.guildId, server => {
      server.botRoleId = role.id;
    });
  }

  @OnCommand("set-hierarchy")
  async onSetHierarchy(command: CommandInteraction) {
    if (!command.memberPermissions.has("Administrator")) return;
    await command.deferReply();
    await command.deleteReply();
    const roles = Array.from(
      { length: 10 },
      (_, i) => command.options.get(`top${10 - i}`, i === 9)?.role,
    )
      .filter(it => it)
      .reverse();
    await withServer(command.guildId, server => {
      server.hierarchy = (this.hierarchies[command.guildId] = roles.map(
        it => it.id,
      )).join(";");
    });
  }

  @OnMemberJoin()
  async onMemberJoin(member: GuildMember) {
    if (member.user.bot) {
      const role = await this.botRole(member.guild);
      if (role) await member.roles.add(role);
    } else
      await withServerMember(member, async user => {
        user.leftAt = undefined;
        if (user.hierarchyRole) return;
        const role = await this.newComerRole(member.guild);
        if (role) await member.roles.add(role);
        user.hierarchyRole = role;
      });
  }

  @OnMemberLeave()
  async onMemberLeave(member: GuildMember) {
    if (member.user.bot) return;
    await updateServerMember(member, {
      leftAt: new Date(),
    });
  }

  @OnMemberUpdate()
  async onMemberUpdate(_: GuildMember, member: GuildMember) {
    await getServerMember(member);
  }

  async newComerRole(guild: Guild) {
    return (await getServer(guild.id)).newComerRoleId;
  }

  async botRole(guild: Guild) {
    return (await getServer(guild.id)).botRoleId;
  }

  async speakerRole(guild: Guild) {
    return (await getServer(guild.id)).speakerRoleId;
  }

  getHierarchy(guild: Guild) {
    return this.hierarchies[guild.id] ?? [];
  }

  async initData(guild: Guild) {
    const server = await getServer(guild.id);
    this.hierarchies[guild.id] =
      server.hierarchy?.split(";")?.filter(it => it) ?? [];
  }

  async isAbove(member: GuildMember, other: GuildMember, by = 1) {
    const hierarchy = this.getHierarchy(member.guild);
    const memberRole = await this.getHierarchyRole(member);
    const otherRole = await this.getHierarchyRole(other);
    return hierarchy.indexOf(memberRole) > hierarchy.indexOf(otherRole) + by;
  }

  async isBelow(member: GuildMember, other: GuildMember, by = 1) {
    const hierarchy = this.getHierarchy(member.guild);
    const memberRole = await this.getHierarchyRole(member);
    const otherRole = await this.getHierarchyRole(other);
    return hierarchy.indexOf(memberRole) < hierarchy.indexOf(otherRole) - by;
  }

  async getHierarchyRole(member: GuildMember) {
    await member.fetch();
    return this.getHierarchy(member.guild).find(it =>
      member.roles.cache.has(it),
    );
  }
}
