import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CategoryChannel,
  ChannelType,
  Client,
  CommandInteraction,
  Guild,
  GuildMember,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  TextChannel,
  EmbedBuilder,
  GuildTextBasedChannel,
  UserResolvable,
  GuildMemberRoleManager,
} from "discord.js";
import { dataSource, withResource } from "src/database/data-source";
import { Server } from "src/database/entities/server";
import { SupportTicket } from "src/database/entities/support-ticket";
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
import {
  getServer,
  getServerMember,
} from "src/discord/members/get-server-member";
import { ManagedMessageService } from "src/discord/services/managed-message";
import { sleep } from "src/util";

const key = "support-create-ticket-message";
@Handler("support")
export class SupportService {
  personalLimit = 2;
  serverLimit = 25;

  @InjectService(() => ManagedMessageService)
  messages!: ManagedMessageService;

  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setDMPermission(false)
        .setName("support")
        .setDescription("Verwalte den Support-Bereich")
        .addSubcommand(cmd =>
          cmd
            .setName("message")
            .setDescription("Bearbeite die 'Neue Ticket Erstellen' Nachricht.")
            .addStringOption(opt =>
              opt
                .setName("content")
                .setDescription("Inhalt der Nachricht")
                .setRequired(true),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("channel")
            .setDescription("Lege die Kanal-Kategorie für Supportanfragen fest")
            .addChannelOption(opt =>
              opt
                .setName("channel")
                .setDescription("Die Kanal-Kategorie für den Support")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildCategory),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("add")
            .setDescription("Füge eine Person dem Ticket hinzu")
            .addUserOption(opt =>
              opt
                .setName("user")
                .setDescription("Die hinzuzufügende Person")
                .setRequired(true),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("remove")
            .setDescription("Entferne eine Person aus dem Ticket")
            .addUserOption(opt =>
              opt
                .setName("user")
                .setDescription("Die zu entfernende Person")
                .setRequired(true),
            ),
        )
        .addSubcommand(cmd =>
          cmd
            .setName("assign")
            .setDescription("Weise eine Person die Verantwortung zu")
            .addUserOption(opt =>
              opt
                .setName("user")
                .setDescription("Die zuzuweisende Person")
                .setRequired(true),
            ),
        ),
    );
  }

  @OnCommand("support", "message")
  async onSupportMessageUpdate(command: CommandInteraction) {
    const content = command.options.get("content")?.value?.toString()?.trim();

    if (content === "-") {
      const value = await this.messages.getContent(command.guild, key);
      return command.showModal(
        new ModalBuilder()
          .setCustomId("support:message")
          .setTitle("Support-Nachricht bearbeiten")
          .setComponents(
            new ActionRowBuilder<TextInputBuilder>().setComponents(
              new TextInputBuilder()
                .setStyle(TextInputStyle.Paragraph)
                .setLabel("Inhalt")
                .setRequired(true)
                .setCustomId("content")
                .setPlaceholder("Erstelle eine Supportanfrage...")
                .setValue(value),
            ),
          ),
      );
    }
    await command.deferReply({ ephemeral: true });

    if (!command.memberPermissions.has("Administrator"))
      return await command.editReply({
        content: "Dir fehlen die Berechtigungen, dies zu tun.",
      });

    if (!content)
      return await command.editReply({
        content: "Du musst einen Text mitgeben!",
      });

    await this.messages.editMessage(command.guild, key, content);

    await command.editReply({
      content: "Nachricht bearbeitet!",
    });
  }

  @OnCommand("support", "add")
  @HasPermission("ManageMessages")
  async onSupportAddPerson(cmd: CommandInteraction) {
    const user = cmd.options.getUser("user");
    const ticket = await this.findTicketByChannel(cmd.channelId);
    if (!ticket)
      return await cmd.editReply({
        content: "Bitte verwende diesen Befehl nur im Kontext des Tickets.",
      });
    await this.addMemberPermissions(cmd.channel as TextChannel, user);
    await cmd.channel.send(`${cmd.member} hat ${user} zum Ticket hinzugefügt.`);
    await cmd.deleteReply();
  }

  @OnCommand("support", "remove")
  @HasPermission("ManageMessages")
  async onSupportRemovePerson(cmd: CommandInteraction) {
    const user = cmd.options.getUser("user");
    const ticket = await this.findTicketByChannel(cmd.channelId);
    if (!ticket)
      return await cmd.editReply({
        content: "Bitte verwende diesen Befehl nur im Kontext des Tickets.",
      });
    await this.removeMemberPermissions(cmd.channel as TextChannel, user);
    await cmd.channel.send(`${cmd.member} hat ${user} vom Ticket entfernt.`);
    await cmd.deleteReply();
  }

  @OnCommand("support", "assign")
  @HasPermission("ManageMessages")
  async onSupportAssign(cmd: CommandInteraction) {
    const user = cmd.options.getUser("user");
    const ticket = await this.findTicketByChannel(cmd.channelId);
    if (!ticket)
      return await cmd.editReply({
        content: "Bitte verwende diesen Befehl nur im Kontext des Tickets.",
      });
    const member = await cmd.guild.members.fetch(user);
    ticket.assigned = (await getServerMember(member)) ?? ticket.assigned;
    await dataSource.getRepository(SupportTicket).save(ticket);
    await this.updateTicketStatus(cmd.channel as any, ticket);
    cmd.channel.send(
      `${cmd.member} hat ${
        cmd.user.id === user.id ? "sich selbst" : user
      } das Ticket zugewiesen.`,
    );
    await cmd.deleteReply();
  }

  @OnFormSubmit("message")
  @HasPermission("Administrator")
  async onMessageSubmit(form: ModalSubmitInteraction) {
    const content = form.fields.getTextInputValue("content");
    await this.messages.editMessage(form.guild, key, content);
    return await form.editReply({
      content: "Nachricht bearbeitet!",
    });
  }

  @OnCommand("support", "channel")
  @HasPermission("Administrator")
  async onSupportChannelSet(command: CommandInteraction) {
    const channel = command.options.get("channel").channel as CategoryChannel;
    const support = await this.initialiseSupportCategory(channel);

    await withResource(Server, { discordId: command.guildId }, server => {
      server.supportChannelId = channel.id;
      server.supportChannelType = "text";
    });

    await command.editReply({
      content: `${support} wurde als Supportkanal eingerichtet`,
    });
  }

  async initialiseSupportCategory(channel: CategoryChannel) {
    if (!channel.children.cache.find(it => it.name === "support")) {
      const intro = await channel.children.create({
        name: "support",
        reason: "create support channel",
        topic: "Erstelle Supportanfragen hier",
        position: 0,
        type: ChannelType.GuildText,
      });
      await intro.permissionOverwrites.create(channel.guild.roles.everyone, {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false,
      });
      await this.sendCreateTicketMessage(intro);
      return intro;
    } else return channel.children.cache.find(it => it.name === "support");
  }

  async sendCreateTicketMessage(channel: GuildTextBasedChannel) {
    const msg = await this.messages.getOrCreateManagedMessage(
      channel.guild,
      key,
    );
    await this.messages.replaceMessage(channel.guild, channel, key, {
      content: msg.content || "Eröffne eine Supportanfrage:",
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Primary)
            .setLabel("Support-Ticket eröffnen")
            .setCustomId("support:create"),
        ),
      ],
    });
  }

  @OnButton("create")
  async onCreateSupportTicketClick(btn: ButtonInteraction) {
    await btn.showModal(
      new ModalBuilder()
        .setCustomId("support:create")
        .setTitle("Supportanfrage Erstellen")
        .setComponents(
          new ActionRowBuilder<TextInputBuilder>().setComponents(
            new TextInputBuilder()
              .setStyle(TextInputStyle.Short)
              .setLabel("Titel")
              .setRequired(true)
              .setMaxLength(200)
              .setMinLength(3)
              .setCustomId("title")
              .setPlaceholder("Ich habe ein Problem"),
          ),
          new ActionRowBuilder<TextInputBuilder>().setComponents(
            new TextInputBuilder()
              .setStyle(TextInputStyle.Paragraph)
              .setLabel("Beschreibung")
              .setRequired(false)
              .setCustomId("description")
              .setPlaceholder(`Ich habe ein Problem mit...
Ich möchte einen Nutzer melden...
Ich habe einen Fehler gefunden...`),
          ),
        ),
    );
  }

  @OnFormSubmit("create")
  async onCreateSupportTicketSubmit(form: ModalSubmitInteraction) {
    const user = form.member;
    const title = form.fields.getTextInputValue("title");
    const description = form.fields.getTextInputValue("description") || null;
    const guild = form.guild;

    await form.deferReply({ ephemeral: true });

    const repo = dataSource.getRepository(SupportTicket);
    const server = await getServer(guild.id);
    const member = await getServerMember(user as any);

    const isMod = (user.roles as GuildMemberRoleManager).cache.has(
      server.modRoleId,
    );

    const ticketCount = await repo.countBy({
      author: { discordId: form.member.user.id },
      status: "open",
    });
    if (ticketCount > this.personalLimit && !isMod)
      return await form.editReply({
        content: `Du kannst nicht mehr als ${this.personalLimit} Support Anfragen gleichzeitig eröffnen.`,
      });

    const totalCount = await repo.countBy({
      guild: { discordId: form.guildId },
      status: "open",
    });
    if (totalCount > this.serverLimit && !isMod)
      return form.editReply({
        content: `Es sind bereits zu viele Supportanfragen offen! Bitte lasse dir etwas Zeit oder wende dich direkt an die Moderation.`,
      });

    const ticket = repo.create({
      guild: server,
      author: member,
      title,
      description,
    });
    await repo.save(ticket);
    await this.populateSupportTicket(ticket, guild, user as any, isMod);
    await repo.save(ticket);
    await form.editReply({ content: "Support Ticket wurde angelegt!" });
    await sleep(5000);
    await form.deleteReply();
  }

  async populateSupportTicket(
    ticket: SupportTicket,
    guild: Guild,
    member: GuildMember,
    isMod: boolean,
  ) {
    const channel = await guild.channels.fetch(ticket.guild.supportChannelId);
    return this.createTextChannel(ticket, channel as any, member, isMod);
  }

  async createTextChannel(
    ticket: SupportTicket,
    channel: CategoryChannel,
    member: GuildMember,
    isMod: boolean,
  ) {
    const thread = await channel.children.create({
      type: ChannelType.GuildText,
      topic: ticket.title,
      name: `ticket-${ticket.id}-${member.displayName.replace(
        /[^a-zA-Z0-9]*/g,
        "",
      )}`,
      permissionOverwrites: [],
    });
    await this.initialiseSupportTicket(ticket, thread, isMod);
    ticket.channelId = thread.id;
  }

  async initialiseSupportTicket(
    ticket: SupportTicket,
    thread: TextChannel,
    isMod: boolean,
  ) {
    const { modRoleId } = ticket.guild;
    await this.setupThreadPermissions(ticket, thread);
    await thread.send({
      embeds: [new EmbedBuilder().setDescription("Ticket wird erstellt...")],
    });
    await this.updateTicketStatus(thread, ticket);
    await thread.send({
      content: isMod
        ? `<@${ticket.author.discordId}> bitte füge eine Person mit \`support assign\` hinzu.`
        : `Bitte beschreibe deine Problematik so genau wie möglich. Jemand aus der <@&${modRoleId}> wird sich bald um dich kümmern.`,
    });
  }

  async setupThreadPermissions(ticket: SupportTicket, thread: TextChannel) {
    await thread.permissionOverwrites.create(thread.guild.roles.everyone, {
      ViewChannel: false,
      SendMessages: false,
    });
    await thread.permissionOverwrites.create(ticket.guild.modRoleId, {
      ViewChannel: true,
      SendMessages: true,
    });
    await this.addMemberPermissions(thread, ticket.author.discordId);
  }

  async addMemberPermissions(thread: TextChannel, member: UserResolvable) {
    await thread.permissionOverwrites.create(member, {
      ViewChannel: true,
      SendMessages: true,
    });
  }

  async removeMemberPermissions(thread: TextChannel, member: UserResolvable) {
    await thread.permissionOverwrites.delete(member);
  }

  @OnButton("close")
  async onTicketClose(interaction: ButtonInteraction, ticketId: string) {
    await interaction.deferUpdate();
    await withResource(SupportTicket, { id: +ticketId }, ticket => {
      ticket.status = "closed";
      ticket.closedAt = new Date();
    });
    await interaction.channel.send({
      content: `Das Ticket wurde von ${interaction.member} geschlossen.`,
    });
    await this.updateTicketStatus(interaction.channel as any, ticketId);
  }

  @OnButton("remove")
  @HasPermission("ManageMessages")
  async onTicketRemove(btn: ButtonInteraction, ticketId: string) {
    const ticket = await this.findTicket(ticketId);
    const channel = await btn.guild.channels.fetch(ticket.channelId);
    await channel.delete();
  }

  @OnButton("self-assign")
  async onTicketSelfAssign(btn: ButtonInteraction, ticketId: string) {
    await btn.deferReply({ ephemeral: true });
    const ticket = await this.findTicket(ticketId);
    if (ticket.author.discordId === btn.member.user.id)
      return btn.editReply({
        content: "Du kannst dir dieses Ticket nicht selbst zuweisen.",
      });
    const member = await getServerMember(btn.member as any);
    await withResource(SupportTicket, { id: +ticketId }, ticket => {
      ticket.assigned = member;
    });
    await this.updateTicketStatus(btn.channel as any, ticketId);
    await btn.deleteReply();
    await btn.channel.send({
      content: `${btn.member} hat dieses Ticket übernommen.`,
    });
  }

  async findTicket(id: string) {
    return await dataSource.getRepository(SupportTicket).findOne({
      where: { id: +id },
      relations: ["author", "guild", "assigned"],
    });
  }

  async findTicketByChannel(channelId: string) {
    return await dataSource.getRepository(SupportTicket).findOne({
      where: { channelId },
      relations: ["author", "guild", "assigned"],
    });
  }

  async updateTicketStatus(
    channel: TextChannel,
    ticketId: string | SupportTicket,
  ) {
    const ticket =
      typeof ticketId === "string" ? await this.findTicket(ticketId) : ticketId;
    const messages = await channel.messages.fetch();
    const first = messages.last();
    const assigned = ticket.assigned?.discordId;
    await first.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Ticket #${ticket.id}: ${ticket.title}`)
          .setDescription(ticket.description)
          .setFields([
            {
              name: "Autor",
              value: `<@${ticket.author.discordId}>`,
              inline: true,
            },
            {
              name: "Status",
              value: ticket.status,
              inline: true,
            },
            {
              name: "Erstellt",
              value: ticket.createdAt.toLocaleString("de"),
              inline: true,
            },
            {
              name: "Zugewiesen",
              value: assigned ? `<@${assigned}>` : "Keine*r",
              inline: true,
            },
          ]),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().setComponents(
          this.buildActionRow(ticket),
        ),
      ],
    });
  }

  buildActionRow(ticket: SupportTicket): ButtonBuilder[] {
    switch (ticket.status) {
      case "closed":
        return [
          new ButtonBuilder()
            .setLabel("Channel Schließen")
            .setStyle(ButtonStyle.Danger)
            .setCustomId(`support:remove:${ticket.id}`),
        ];
      case "open":
        return [
          new ButtonBuilder()
            .setLabel("Schließen")
            .setStyle(ButtonStyle.Danger)
            .setCustomId(`support:close:${ticket.id}`),
          new ButtonBuilder()
            .setLabel("Übernehmen")
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`support:self-assign:${ticket.id}`)
            .setDisabled(ticket.assigned != null),
        ];
    }
  }
}
