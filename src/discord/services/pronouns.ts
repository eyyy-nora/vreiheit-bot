import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  CommandInteraction,
  ComponentType,
  Guild,
  GuildMember,
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
  OnMemberLeave,
} from "src/discord/decorators";
import { updateServerMember } from "src/discord/members/get-server-member";
import { ensureRolesExist } from "src/discord/roles/ensure-roles-exist";
import { I18nService } from "src/discord/services/i18n";
import { chunks, createInverseLookup } from "src/util";

@Handler("pronouns")
export class Pronouns {
  pronounPrefix = "Pronomen";
  pronounRoles = {
    "she/her": {
      name: this.prefix("She/Her"),
      color: "#fda4af",
    },
    "she/they": {
      name: this.prefix("She/They"),
      color: "#f0abfc",
    },
    "they/them": {
      name: this.prefix("They/Them"),
      color: "#a78bfa",
    },
    "he/they": {
      name: this.prefix("He/They"),
      color: "#818cf8",
    },
    "he/him": {
      name: this.prefix("He/Him"),
      color: "#93c5fd",
    },
    "he/she/they": {
      name: this.prefix("He/She/They"),
      color: "#fdba74",
    },
    "any": {
      name: this.prefix("Any"),
      color: "#71cb9f",
    },
    "ask": {
      name: this.prefix("Nachfragen"),
      color: "#86efac",
    },
  } as const;
  pronounRolesShared = {
    permissions: [],
    mentionable: false,
  } as const;

  pronounCache: Record<string, Record<string, string>> = {};
  otherPronounCache: Record<string, string[]> = {};
  pronounNames: Record<string, Record<string, string>> = {};

  @InjectService(() => I18nService)
  i18n!: I18nService;

  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("pronouns")
        .setDescription("Zeige die Pronomenselektion an")
        .setDMPermission(false),
    );
    for (const guild of client.guilds.cache.values()) {
      await this.ensureRolesExist(guild);
      for (const role of guild.roles.cache.values())
        if (
          role.name.startsWith(this.prefix()) &&
          !this.pronounNames[guild.id][role.id]
        ) {
          (this.otherPronounCache[guild.id] ??= []).push(role.id);
          (this.pronounNames[guild.id] ??= {})[role.id] = this.stripPrefix(
            role.name,
          );
        }
    }
  }

  @OnCommand("pronouns")
  @HasPermission("ManageMessages")
  async onPronounsCommand(interaction: CommandInteraction) {
    await interaction.channel.send({
      content: this.i18n.get("guild.pronouns"),
      components: await this.primaryPronounButtons(interaction.guild),
    });
    await interaction.deleteReply();
  }

  @OnButton("set")
  async onPrimaryPronounsClick(
    interaction: ButtonInteraction,
    remainingPrefix: string,
  ) {
    await interaction.deferUpdate();
    await this.togglePronounRole(
      interaction.member as GuildMember,
      this.pronounCache[interaction.guildId][remainingPrefix] ??
        remainingPrefix,
    );
  }

  @OnButton("add")
  async onCustomPronounsClick(event: ButtonInteraction) {
    await event.showModal(
      new ModalBuilder()
        .setCustomId("pronouns:add")
        .setTitle("Benutzerdefinierte Pronomen")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("name")
              .setLabel("Bitte gebe deine gewünschten Pronomen ein.")
              .setPlaceholder("Xie/Xier")
              .setRequired(true)
              .setStyle(TextInputStyle.Short),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("color")
              .setLabel("Bitte gebe eine Farbe als Hex-Code ein.")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder("#86efac"),
          ),
        ),
    );
  }

  @OnButton("delete")
  async onPronounsDelete(i: ButtonInteraction, userId: string) {
    const member = await i.guild.members.fetch(userId);
    if (!member)
      return i.reply({
        content: "Dieses Mitglied existiert nicht!",
        ephemeral: true,
      });
    else {
      await i.deferReply();
      await this.onMemberLeave(member);
      await i.editReply("Pronomen Gelöscht!");
      await i.message.edit({
        components: [],
      });
    }
  }

  @OnFormSubmit("add")
  async onCustomPronounsSubmit(form: ModalSubmitInteraction) {
    const color =
      form.fields.getField("color", ComponentType.TextInput).value || "#86efac";
    const name = form.fields.getField("name", ComponentType.TextInput).value;
    if (!name || name.length > 20) await form.followUp("Ungültige Pronomen");
    else if (!/^#[0-9a-fA-F]{6}$/.test(color))
      await form.followUp("Ungültiger Farbcode");
    else {
      await form.deferUpdate();
      await this.createCustomPronounRole(
        form.member as GuildMember,
        name,
        color as any,
      );
    }
  }

  @OnMemberLeave()
  async onMemberLeave(member: GuildMember) {
    const other = await this.getCustomPronouns(member.guild);
    for (const role of other)
      if (member.roles.cache.has(role)) await member.guild.roles.delete(role);
  }

  async createCustomPronounRole(
    member: GuildMember,
    pronouns: string,
    color: `#${string}`,
  ) {
    const role = await member.guild.roles.create({
      ...this.pronounRolesShared,
      name: this.prefix(pronouns),
      color,
    });
    (this.otherPronounCache[member.guild.id] ??= []).push(role.id);
    this.pronounNames[member.guild.id][role.id] = pronouns;
    await this.togglePronounRole(member, role.id);
  }

  async togglePronounRole(member: GuildMember, roleId: string) {
    await member.fetch();
    const roles = member.roles.cache;
    const { other = [], ...primary } = await this.getPronouns(member.guild);
    const pronouns = Object.values(primary).concat(...other);
    let added: string;
    for (const role of pronouns as string[]) {
      const has = roles.has(role);
      const match = role === roleId;
      if (has && match) {
        added = role;
        continue;
      }
      if (!match) {
        if (has) await member.roles.remove(role);
        if (has && other.includes(role)) {
          await member.guild.roles.delete(role);
          other.splice(other.indexOf(role), 1);
        }
      } else if (match) await member.roles.add((added = role));
    }
    await updateServerMember(member, {
      pronouns: this.pronounNames[member.guild.id][added] ?? added,
    });
  }

  async primaryPronounButtons(guild: Guild) {
    const pronouns = await this.getPrimaryPronouns(guild);
    const names = createInverseLookup(pronouns, this.stripPrefix.bind(this));
    const buttons = Object.values(pronouns)
      .map(role =>
        new ButtonBuilder()
          .setCustomId(`pronouns:set:${role}`)
          .setStyle(ButtonStyle.Primary)
          .setLabel(names[role]),
      )
      .concat(
        new ButtonBuilder()
          .setCustomId("pronouns:add")
          .setLabel("Andere...")
          .setStyle(ButtonStyle.Primary),
      );
    return chunks(buttons, 5).map(it =>
      new ActionRowBuilder<ButtonBuilder>().setComponents(it),
    );
  }

  async getPrimaryPronouns(guild: Guild) {
    return this.pronounCache[guild.id];
  }

  async getPronouns(guild: Guild) {
    return {
      ...this.pronounCache[guild.id],
      other: this.otherPronounCache[guild.id] ?? [],
    };
  }

  async getCustomPronouns(guild: Guild) {
    return this.otherPronounCache[guild.id] ?? [];
  }

  async ensureRolesExist(guild: Guild) {
    if (this.pronounCache[guild.id]) return;
    const roles = await ensureRolesExist(
      guild,
      Object.values(this.pronounRoles).map(role => ({
        ...this.pronounRolesShared,
        ...role,
      })),
    );
    this.pronounCache[guild.id] ??= {};
    this.pronounNames[guild.id] ??= {};
    for (const role of roles) {
      this.pronounCache[guild.id][this.stripPrefix(role.name)] = role.id;
      this.pronounNames[guild.id][role.id] = this.stripPrefix(role.name);
    }
  }

  prefix(name: string = "") {
    return `${this.pronounPrefix}: ${name}`;
  }

  stripPrefix(name: string) {
    return name.startsWith(this.prefix())
      ? name.slice(this.prefix().length)
      : name;
  }
}
