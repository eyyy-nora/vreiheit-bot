import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  CommandInteraction,
  Guild,
  GuildMember,
  MessageCreateOptions,
  MessagePayload,
  Role,
  SlashCommandBuilder,
} from "discord.js";
import { ensureCommand } from "src/commands/ensure-command";
import { Handler, OnButton, OnCommand, OnInit } from "src/decorators";
import {
  getServer,
  getServerMember,
  withServer,
} from "src/members/get-server-member";
import { sleep } from "src/util";

@Handler("lifestyle")
export class LifestyleService {
  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("lifestyle")
        .setDMPermission(false)
        .setDescription("Zeigt die Lifestyle Optionen an."),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("set-vegan-role")
        .setDMPermission(false)
        .setDescription("Setzt die vegane Lifestyle-Rolle")
        .addRoleOption(builder =>
          builder.setName("role").setDescription("Rolle").setRequired(true),
        ),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("set-not-vegan-role")
        .setDMPermission(false)
        .setDescription("Setzt die night vegane Lifestyle-Rolle")
        .addRoleOption(builder =>
          builder.setName("role").setDescription("Rolle").setRequired(true),
        ),
    );
  }

  @OnCommand("lifestyle")
  async onLifestyleCommand(command: CommandInteraction) {
    if (!command.memberPermissions.has("Administrator")) return;
    command.channel.send({
      content: "Lebst du vegan?",
      components: [
        new ActionRowBuilder<ButtonBuilder>().setComponents(
          new ButtonBuilder()
            .setCustomId("lifestyle:not-vegan")
            .setStyle(ButtonStyle.Danger)
            .setLabel("Nein"),
          new ButtonBuilder()
            .setCustomId("lifestyle:vegan")
            .setStyle(ButtonStyle.Success)
            .setLabel("Ja"),
        ),
      ],
    });
  }

  @OnCommand("set-vegan-role")
  async onSetVeganRole(command: CommandInteraction) {
    await command.deferReply();
    if (!command.memberPermissions.has("Administrator"))
      return command.reply("Das darfst du nicht.");
    const role = command.options.get("role", true)?.role?.id;
    if (!role) return command.reply("Diese Rolle existiert nicht.");
    await withServer(command.guildId, server => {
      server.veganRoleId = role;
    });
    await command.deleteReply();
  }

  @OnCommand("set-not-vegan-role")
  async onSetNonVeganRole(command: CommandInteraction) {
    await command.deferReply();
    if (!command.memberPermissions.has("Administrator"))
      return command.reply("Das darfst du nicht.");
    const role = command.options.get("role", true)?.role?.id;
    if (!role) return command.reply("Diese Rolle existiert nicht.");
    await withServer(command.guildId, server => {
      server.notVeganRoleId = role;
    });
    await command.deleteReply();
  }

  @OnButton("vegan")
  async onLifestyleVegan(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const [on, off] = await this.roles(interaction.guild);
    await this.toggleLifestyleRole(interaction, on, off);
  }

  @OnButton("not-vegan")
  async onLifestyleNotVegan(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const [off, on] = await this.roles(interaction.guild);
    await this.toggleLifestyleRole(interaction, on, off);
  }

  async toggleLifestyleRole(
    interaction: ButtonInteraction,
    on?: Role,
    off?: Role,
  ) {
    if (!on || !off) return await interaction.deleteReply();
    const user = await getServerMember(interaction.member as any);
    if (!user.rulesAccepted)
      return await this.tempReply(
        interaction,
        "Du musst zuerst die Regeln akzeptieren.",
      );
    if (!user.pronouns)
      return await this.tempReply(
        interaction,
        "Du musst zuerst deine Pronomen festlegen.",
      );
    await (interaction.member as GuildMember).fetch();
    const roles = (interaction.member as GuildMember).roles;
    if (roles.cache.has(off.id)) await roles.remove(off);
    if (!roles.cache.has(on.id)) await roles.add(on);
    return await interaction.editReply(`Lifestyle auf ${on.name} gesetzt!`);
  }

  async roles(guild: Guild) {
    const server = await getServer(guild.id);
    return [
      server.veganRoleId && (await guild.roles.fetch(server.veganRoleId)),
      server.notVeganRoleId && (await guild.roles.fetch(server.notVeganRoleId)),
    ];
  }

  async tempReply(
    interaction: ButtonInteraction,
    message: MessagePayload | string | MessageCreateOptions,
    ms = 5000,
  ) {
    if (interaction.deferred) await interaction.editReply(message);
    else await interaction.reply(message as any);
    await sleep(ms);
    await interaction.deleteReply();
  }
}
