import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  CommandInteraction,
  Guild,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import { withResource } from "src/database/data-source";
import { Server } from "src/database/entities/server";
import { ensureCommand } from "src/discord/commands/ensure-command";
import {
  Handler,
  HasPermission,
  InjectService,
  OnAutocomplete,
  OnButton,
  OnCommand,
  OnInit,
} from "src/discord/decorators";
import {
  getServer,
  withServerMember,
} from "src/discord/members/get-server-member";
import { ManagedMessageService } from "src/discord/services/managed-message";
import { chunks, sleep } from "src/util";

@Handler("interests")
export class InterestsService {
  @InjectService(() => ManagedMessageService)
  messages!: ManagedMessageService;

  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("create-interest")
        .setDMPermission(false)
        .setDescription("Erstelle eine Interessensoption")
        .addStringOption(opt =>
          opt
            .setName("tag")
            .setDescription("Identifikation der Interessensoption")
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName("name")
            .setDescription("Name der Interessensoption")
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName("description")
            .setDescription("Beschreibung der Interessensoption")
            .setRequired(true),
        )
        .addRoleOption(opt =>
          opt
            .setName("role")
            .setDescription("Zugeordnete Rolle")
            .setRequired(false),
        ),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("show-interest-options")
        .setDMPermission(false)
        .setDescription("Poste die Optionen für mögliche Interessen"),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("edit-interest")
        .setDMPermission(false)
        .setDescription("Bearbeite Interessensoptionen")
        .addStringOption(opt =>
          opt
            .setName("tag")
            .setDescription("Identifikation der Interessensoption")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption(opt =>
          opt
            .setName("name")
            .setDescription("Name der Interessensoption")
            .setRequired(false),
        )
        .addStringOption(opt =>
          opt
            .setName("description")
            .setDescription("Beschreibung der Interessensoption")
            .setRequired(false),
        )
        .addRoleOption(opt =>
          opt
            .setName("role")
            .setDescription("Zugeordnete Rolle")
            .setRequired(false),
        ),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("delete-interest")
        .setDMPermission(false)
        .setDescription("Lösche Interessensoptionen")
        .addStringOption(opt =>
          opt
            .setName("tag")
            .setDescription("Identifikation der Interessensoption")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    );
  }

  @OnCommand("create-interest")
  @HasPermission("Administrator")
  async onCreateInterest(cmd: CommandInteraction) {
    const tag = cmd.options.get("tag").value as string;
    const name = cmd.options.get("name").value as string;
    const description = cmd.options.get("description").value as string;
    const roleId = cmd.options.get("role")?.role?.id;

    const interests = await this.interests(cmd.guild.id);
    interests[tag] = { name, description, roleId, tag };
    await withResource(Server, { discordId: cmd.guildId }, server => {
      server.interests = { ...interests };
    });

    await this.updateInterests(cmd.guild, interests);
    await cmd.editReply({ content: "Interesse Erstellt" });
  }

  @OnAutocomplete("edit-interest", "tag")
  @OnAutocomplete("delete-interest", "tag")
  async onAutocompleteTag(
    auto: AutocompleteInteraction,
    option: any,
    value: string,
  ) {
    const options = await this.interests(auto.guildId);
    const filtered = Object.values(options)
      .filter(
        it =>
          it.tag.includes(value) ||
          it.name.includes(value) ||
          it.description?.includes(value),
      )
      .map(({ name, tag }) => ({ name, value: tag }));
    await auto.respond(filtered);
  }

  @OnCommand("edit-interest")
  @HasPermission("Administrator")
  async onEditInterest(cmd: CommandInteraction) {
    const tag = cmd.options.get("tag").value as string;
    const name = cmd.options.get("name")?.value as string;
    const description = cmd.options.get("description")?.value as string;
    const roleId = cmd.options.get("role")?.role?.id;

    const interests = await this.interests(cmd.guild.id);
    const before = interests[tag];
    if (name) before.name = name;
    if (description) before.description = description;
    if (roleId) before.roleId = roleId;

    await withResource(Server, { discordId: cmd.guildId }, server => {
      server.interests = { ...interests };
    });

    await this.updateInterests(cmd.guild, interests);
    await cmd.editReply({ content: "Interesse Bearbeitet" });
  }

  @OnCommand("delete-interest")
  @HasPermission("Administrator")
  async onDeleteInterest(cmd: CommandInteraction) {
    const tag = cmd.options.get("tag").value as string;
    await withResource(Server, { discordId: cmd.guildId }, server => {
      delete server.interests[tag];
      server.interests = { ...server.interests };
    });
    const interests = await this.interests(cmd.guild.id);
    await this.updateInterests(cmd.guild, interests);
    await cmd.editReply({ content: "Interesse Gelöscht" });
  }

  @OnCommand("show-interest-options")
  @HasPermission("Administrator")
  async onShowInterestOptions(cmd: CommandInteraction) {
    await this.messages.replaceMessage(
      cmd.guild,
      cmd.channel,
      "interests",
      this.buildInterestMessageBody(await this.interests(cmd.guildId)),
    );
    await cmd.deleteReply();
  }

  @OnButton("assign")
  async onInterestAssign(btn: ButtonInteraction, tag: string, roleId?: string) {
    await btn.deferReply({ ephemeral: true });
    let on: boolean = false;
    const member = btn.member as GuildMember;
    await withServerMember(member, member => {
      on = !member.interests[tag];
      member.interests = { ...member.interests, [tag]: on };
    });
    if (roleId)
      if (on) await member.roles.add(roleId);
      else await member.roles.remove(roleId);
    if (on) await btn.editReply({ content: "Interesse hinzugefügt!" });
    else await btn.editReply({ content: "Interesse entfernt!" });
    await sleep(5000);
    await btn.deleteReply();
  }

  async interests(guild: string) {
    const server = await getServer(guild);
    return server.interests;
  }

  async updateInterests(guild: Guild, interests?: any) {
    if (!interests) interests = await this.interests(guild.id);
    await this.messages.editMessage(
      guild,
      "interests",
      this.buildInterestMessageBody(interests),
    );
  }

  buildInterestMessageBody(interests: any) {
    return {
      content: `Wähle deine Interessen:\n\n${Object.values(interests)
        .map(({ name, description }) => `**${name}**: ${description}`)
        .join("\n")}`,
      components: this.createInterestButtons(interests),
    };
  }

  createInterestButtons(
    interests: Record<
      string,
      { roleId?: string; name: string; description: string; tag: string }
    >,
  ) {
    const buttons = Object.values(interests).map(({ name, tag, roleId }) => {
      return new ButtonBuilder()
        .setLabel(name)
        .setCustomId(`interests:assign:${tag}:${roleId ?? ""}`)
        .setStyle(ButtonStyle.Secondary);
    });
    return chunks(buttons, 5).map(chunk =>
      new ActionRowBuilder<ButtonBuilder>().setComponents(chunk),
    );
  }
}
