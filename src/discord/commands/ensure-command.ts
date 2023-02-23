import {
  ApplicationCommandDataResolvable,
  BaseApplicationCommandData,
  Client,
  Guild,
} from "discord.js";
import { PromiseOr } from "src/util";
import { diffJson } from "diff";

function objectsAreEqual(command: any, other: any) {
  const sortKeys = (obj: any) => {
    return Array.isArray(obj)
      ? obj.map(sortKeys)
      : typeof obj === "object"
      ? Object.fromEntries(
          Object.entries(obj)
            .map(([key, value]) => [key, sortKeys(value)])
            .filter(([key]) => key !== "dm_permission")
            .sort(([a], [b]) => (b > a ? 1 : b < a ? -1 : 0)),
        )
      : obj;
  };
  const fromKeys = (command: any, other: any) =>
    Array.isArray(command) || Array.isArray(other)
      ? other ?? []
      : Object.fromEntries(
          Object.entries(command).map(([key, value]) => {
            if (typeof value === "object" || typeof other?.[key] === "object")
              return [key, fromKeys(value, other?.[key])];
            else return [key, other?.[key]];
          }),
        );

  const equivalentConfig = fromKeys(command, other);

  const diffs = diffJson(
    JSON.stringify(sortKeys(command), null, 2),
    JSON.stringify(sortKeys(equivalentConfig), null, 2),
  );
  return diffs.length === 1;
}

export async function ensureCommand(
  client: Client<true>,
  command:
    | ApplicationCommandDataResolvable
    | ((guild: Guild) => PromiseOr<ApplicationCommandDataResolvable>),
) {
  for (const guild of client.guilds.cache.values()) {
    if (typeof command === "function") command = await command(guild);
    const name = (command as BaseApplicationCommandData).name;

    let orig = guild.commands.cache.find(it => it.name === name);
    if (!orig)
      orig = (await guild.commands.fetch()).find(it => it.name === name);

    if (orig) {
      if ("toJSON" in command) {
        const json = command.toJSON();
        if (!objectsAreEqual(command.toJSON(), orig.toJSON()))
          await orig.edit(json);
      }
    }

    if (orig) return;
    //Command does not exist in cache nor in fetch. create it
    await guild.commands.create(command);
  }
}
