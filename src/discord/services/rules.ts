import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  CommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { ensureCommand } from "src/discord/commands/ensure-command";
import {
  Handler,
  HasPermission,
  InjectService,
  OnButton,
  OnCommand,
  OnFormSubmit,
  OnInit,
} from "src/discord/decorators";
import { withServerMember } from "src/discord/members/get-server-member";
import { ManagedMessageService } from "src/discord/services/managed-message";

@Handler("rules")
export class RulesService {
  @InjectService(() => ManagedMessageService)
  messages!: ManagedMessageService;

  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setDMPermission(false)
        .setName("edit-rules")
        .setDescription("Bearbeite die Regeln"),
    );

    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setDMPermission(false)
        .setName("show-rules")
        .setDescription("Poste die aktuellen Regeln"),
    );
  }

  @OnButton("accept")
  async onRulesAccept(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.deleteReply();
    await withServerMember(interaction.member as any, user => {
      user.rulesAccepted = true;
    });
  }

  @OnFormSubmit("edit")
  @HasPermission("Administrator")
  async onRulesEdit(form: ModalSubmitInteraction) {
    await form.deleteReply();
    await this.messages.editMessage(
      form.guild,
      "rules",
      form.fields.getTextInputValue("text"),
      "embed",
    );
  }

  @OnCommand("edit-rules")
  @HasPermission("Administrator")
  async onEditRules(interaction: CommandInteraction) {
    const text = await this.messages.getContent(interaction.guild, "rules");
    await interaction.showModal(
      new ModalBuilder()
        .setTitle("Regeln bearbeiten")
        .setCustomId("rules:edit")
        .setComponents(
          new ActionRowBuilder<TextInputBuilder>().setComponents(
            new TextInputBuilder()
              .setLabel(`Regeln`)
              .setValue(text)
              .setCustomId(`text`)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          ),
        ),
    );
  }

  @OnCommand("show-rules")
  @HasPermission("Administrator")
  async onShowRules(interaction: CommandInteraction) {
    const text = await this.messages.getContent(interaction.guild, "rules");
    await interaction.deleteReply();
    await this.messages.replaceMessage(
      interaction.guild,
      interaction.channel,
      "rules",
      {
        embeds: [new EmbedBuilder().setDescription(text)],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Akzeptieren")
              .setStyle(ButtonStyle.Success)
              .setCustomId("rules:accept"),
          ),
        ],
      },
    );
  }
}
