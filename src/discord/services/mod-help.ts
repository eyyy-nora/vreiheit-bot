import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  CommandInteraction,
  EmbedBuilder,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import { withResource } from "src/database/data-source";
import { Server } from "src/database/entities/server";
import { ensureCommand } from "src/discord/commands/ensure-command";
import { Handler, OnButton, OnCommand, OnInit } from "src/discord/decorators";
import { getServer } from "src/discord/members/get-server-member";
import { sendMessage } from "src/discord/messages";
import { sleep } from "src/util";

@Handler("modhelp")
export class ModHelpService {
  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("helpme")
        .setDescription("Informiere die Moderation, dass du Hilfe brauchst")
        .setDMPermission(false)
        .addStringOption(option =>
          option.setRequired(false).setName("reason").setDescription("Grund"),
        ),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("set-mod-role")
        .setDescription("Legt die Rolle für Mods fest.")
        .setDMPermission(false)
        .addRoleOption(option =>
          option.setRequired(true).setName("role").setDescription("Mod Rolle"),
        ),
    );
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("set-mod-help-channel")
        .setDescription("Legt den Kanal für die Mod-Hilfe fest.")
        .setDMPermission(false)
        .addChannelOption(option =>
          option
            .setRequired(true)
            .setName("channel")
            .setDescription("Mod-Hilfe Channel"),
        ),
    );
  }

  @OnCommand("set-mod-role")
  async onSetModRole(command: CommandInteraction) {
    await command.deferReply({ ephemeral: true });
    if (!command.memberPermissions.has("Administrator"))
      return await command.editReply({
        content: "Du hast nicht die Berechtigung dazu, dies zu tun.",
      });

    const role = command.options.get("role").role;
    await withResource(Server, { discordId: command.guildId }, async server => {
      server.modRoleId = role.id;
    });

    await command.editReply({ content: "Mod Rolle gesetzt!" });
    await sleep(5000);
    await command.deleteReply();
  }

  @OnCommand("set-mod-help-channel")
  async onSetModHelpChannel(command: CommandInteraction) {
    await command.deferReply({ ephemeral: true });
    if (!command.memberPermissions.has("Administrator"))
      return await command.editReply({
        content: "Du hast nicht die Berechtigung dazu, dies zu tun.",
      });

    const channel = command.options.get("channel").channel;
    await withResource(Server, { discordId: command.guildId }, async server => {
      server.modHelpChannel = channel.id;
    });

    await command.editReply({ content: "Mod-Hilfe Channel gesetzt!" });
    await sleep(5000);
    await command.deleteReply();
  }

  @OnCommand("helpme")
  async onHelpMe(command: CommandInteraction) {
    await command.deferReply({ ephemeral: true });

    const user = command.member;
    const reason = command.options.get("reason")?.value;
    const channel = command.channel;
    const voice = (command.member as GuildMember).voice?.channel;
    const server = await getServer(command.guildId);
    const { modHelpChannel, modRoleId } = server;

    const message = [
      `Liebe <@&${modRoleId}>,`,
      `Die/Der Nutzer*in ${user} benötigt im Kanal ${channel} Hilfe!`,
      voice ? `Voice Kanal: ${voice.url}` : undefined,
      reason ? `Grund: ${reason}` : undefined,
    ].filter(it => it);

    await sendMessage(command.guild, modHelpChannel, {
      content: message.join("\n"),
      components: [
        new ActionRowBuilder<ButtonBuilder>().setComponents(
          new ButtonBuilder()
            .setLabel("Übernehmen")
            .setCustomId("modhelp:accept")
            .setStyle(ButtonStyle.Success),
        ),
      ],
    });

    await command.editReply({
      content: "Die Moderation wurde informiert!",
    });
  }

  @OnButton("accept")
  async onModHelpAccept(button: ButtonInteraction) {
    await button.deferUpdate();
    const mod = button.member;
    await button.message.edit({
      components: [],
      embeds: [
        new EmbedBuilder().setDescription(`Wird übernommen durch ${mod}!`),
      ],
    });
  }
}
