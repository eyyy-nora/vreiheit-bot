import {
  CategoryChannel,
  ChannelType,
  Client,
  CommandInteraction,
  Guild,
  SlashCommandBuilder,
  VoiceState,
} from "discord.js";
import { ensureCommand } from "src/discord/commands/ensure-command";
import {
  Handler,
  HasPermission,
  OnCommand,
  OnInit,
  OnVoiceStateUpdate,
} from "src/discord/decorators";
import { getServer, updateServer } from "../members/get-server-member";

@Handler("autovoice")
export class AutovoiceService {
  @OnInit()
  async onInit(client: Client<true>) {
    await ensureCommand(
      client,
      new SlashCommandBuilder()
        .setName("autovoice")
        .setDescription("Verwaltet automatische Voice kanäle")
        .setDMPermission(false)
        .addSubcommand(cmd =>
          cmd
            .setName("channel")
            .setDescription(
              "Lege die Kanalkategorie für die automatischen Voicekanäle fest",
            )
            .addChannelOption(opt =>
              opt
                .setName("channel")
                .setDescription(
                  "Die Kanalkategorie für die automatischen Voicekanäle",
                )
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true),
            ),
        ),
    );
  }

  @OnVoiceStateUpdate()
  async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
    if (oldState.channelId !== newState.channelId)
      await this.rebalanceVoiceChannels(newState.guild);
  }

  voiceChannels(channel: CategoryChannel) {
    return [
      ...channel.children.cache
        .filter(it => it.type == ChannelType.GuildVoice)
        .values(),
    ];
  }

  async rebalanceVoiceChannels(guild: Guild) {
    const channel = await this.voiceCategory(guild);
    if (!channel) return;
    const children = this.voiceChannels(channel);

    const mapped = children.map(channel => ({
      channel,
      empty: !channel.members.size,
    }));

    const emptyCount = mapped.filter(({ empty }) => empty).length;

    if (emptyCount == 0) {
      await mapped[mapped.length - 1].channel.clone({
        name: mapped[mapped.length - 1].channel.name.replace(
          /[0-9]+/g,
          `${mapped.length + 1}`,
        ),
      });
    } else if (emptyCount >= 2) {
      const empty = mapped.filter(it => it.empty);
      empty.shift();
      for (const c of empty) await c.channel.delete();
    }
    let i = 1;
    for (const c of this.voiceChannels(channel))
      await c.setName(mapped[0].channel.name.replace(/[0-9]+/g, `${i++}`));
  }

  async voiceCategory(guild: Guild): Promise<CategoryChannel> {
    const { voiceCategoryId } = await getServer(guild.id);
    if (!voiceCategoryId) return undefined as any;
    return (await guild.channels.fetch(voiceCategoryId)) as any;
  }

  @OnCommand("autovoice", "channel")
  @HasPermission("ManageChannels")
  async onSetAutovoiceChannel(cmd: CommandInteraction) {
    const channel = cmd.options.get("channel").channel as CategoryChannel;
    await updateServer(cmd.guildId, {
      voiceCategoryId: channel.id,
    });

    await this.rebalanceVoiceChannels(cmd.guild);

    await cmd.editReply({
      content: `${channel} wurde als Voice Kategorie festgelegt.`,
    });
  }
}
