import { Interaction, InteractionType } from "discord.js";
import { HandlerMap } from "src/decorators/handler";
import { getMeta } from "src/decorators/meta";
import { PromiseOr } from "src/util";

export function OnInteraction(interactionId: string) {
  return createInteractionDecorator(() => true, interactionId);
}

export function OnButton(buttonId: string) {
  return createInteractionDecorator(i => i.isButton(), buttonId);
}

export function OnCommand(commandId?: string) {
  return createInteractionDecorator(
    InteractionType.ApplicationCommand,
    commandId,
  );
}

export function OnFormSubmit(formId?: string) {
  return createInteractionDecorator(InteractionType.ModalSubmit, formId);
}

export function OnMemberJoin() {
  return createHandlerDecorator("memberJoin");
}

export function OnMemberLeave() {
  return createHandlerDecorator("memberLeave");
}

export function OnMemberUpdate() {
  return createHandlerDecorator("memberUpdate");
}

export function OnRoleCreate() {
  return createHandlerDecorator("roleCreate");
}

export function OnRoleUpdate() {
  return createHandlerDecorator("roleUpdate");
}

export function OnRoleDelete() {
  return createHandlerDecorator("roleDelete");
}

export function OnMessageCreate() {
  return createHandlerDecorator("messageCreate");
}

export function OnMessageUpdate() {
  return createHandlerDecorator("messageUpdate");
}

export function OnMessageDelete() {
  return createHandlerDecorator("messageDelete");
}

export function OnBanCreate() {
  return createHandlerDecorator("ban");
}

export function OnBanDelete() {
  return createHandlerDecorator("unban");
}

export function OnInit() {
  return createHandlerDecorator("init");
}

export function createHandlerDecorator<Key extends keyof HandlerMap>(
  field: Key,
  filter?: (
    this: any,
    ...params: Parameters<HandlerMap[Key][number]>
  ) => PromiseOr<boolean>,
) {
  return function (proto: any, name: string | symbol) {
    getMeta(proto.constructor).handlers[field].push(async function (
      this: any,
      ...params: unknown[]
    ) {
      if (filter && !(await filter.call(this, ...params))) return;
      return this[name].call(this, ...params);
    });
  };
}

export function createInteractionDecorator<Type extends Interaction>(
  type: Type["type"] | ((interaction: Type) => boolean),
  id?: string,
) {
  return function (proto: any, name: string | symbol) {
    getMeta(proto.constructor).handlers.interaction.push(async function (
      this: any,
      interaction: Type,
    ) {
      if (
        typeof type === "function"
          ? !type(interaction)
          : interaction.type !== type
      )
        return;
      if (interaction.isCommand()) {
        if (interaction.commandName !== id) return;
        return this[name].call(this, interaction);
      }
      if ("customId" in interaction) {
        let fullId = [getMeta(this.constructor).prefix ?? "", id]
          .filter(it => it)
          .join(":");
        if (id && id.startsWith("-")) fullId = id.slice(1);

        if (
          interaction.customId !== fullId &&
          !interaction.customId.startsWith(fullId + ":")
        )
          return;
        const remainder = interaction.customId
          .slice(fullId.length + 1)
          .split(":");
        return this[name].call(this, interaction, ...remainder);
      }
    });
  };
}

export function filterById(id: string) {
  return function (this: any, interaction: Interaction) {
    if (!("customId" in interaction)) return false;
    const fullId = [getMeta(this.constructor).prefix ?? "", id]
      .filter(it => it)
      .join(":");
    if (fullId)
      return (
        interaction.customId === fullId ||
        interaction.customId.startsWith(fullId + ":")
      );
    else return true;
  };
}

export function filterByInteractionType(type: InteractionType, id?: string) {
  const idFilter = id ? filterById(id) : () => true;
  return function (this: any, interaction: Interaction) {
    return interaction.type === type && idFilter.call(this, interaction);
  };
}
